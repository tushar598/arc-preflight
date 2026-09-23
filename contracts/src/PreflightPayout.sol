// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title PreflightPayout
/// @notice Batch native-USDC payouts on Arc that never revert because of one bad payee.
///
/// @dev Arc enforces its USDC blocklist, the zero-address rule and the precompile rule
///      at runtime on every value transfer. A top-level send that breaks one of them is
///      included, reverts and still burns gas. Inside a contract the same rule makes the
///      inner CALL fail with Arc's own reason ("Blocked address", "Zero address not
///      allowed"), and that failure can be caught.
///
///      `payMany` turns that into skip-and-refund. Every payee is screened with the same
///      rules the arc-preflight SDK checks off-chain. Clean payees are paid; the rest are
///      refunded to the payer in the same transaction and recorded in a `Skipped` event,
///      so a payroll run with one sanctioned address still pays everyone else.
///
///      No owner, no upgrade path, no funds held between transactions. Each call only
///      moves its own `msg.value`, so a payee that re-enters cannot reach anyone else's
///      money; the only shared state is the lifetime `stats` counters.
contract PreflightPayout {
    /// @notice Why a payee was skipped. Mirrors arc-preflight's `PreflightReasonCode`.
    enum Reason {
        None,
        Blocklist,
        ZeroAddress,
        Precompile,
        BurnForbidden,
        Unknown
    }

    /// @notice Lifetime totals, readable by anyone. Values are native USDC wei (18 decimals).
    struct Stats {
        uint64 batches;
        uint64 paidCount;
        uint64 skippedCount;
        uint128 paidValue;
        uint128 protectedValue;
    }

    /// @notice The USDC predeploy; `isBlacklisted` is the check Arc's exchange guide prescribes.
    address public constant USDC = 0x3600000000000000000000000000000000000000;

    /// @notice Gas forwarded to each payee. Enough for smart-account `receive` hooks, small
    ///         enough that one hostile payee cannot starve the rest of the batch.
    uint256 public constant PAYEE_GAS = 50_000;

    /// @dev Revert data copied back from a failed payee. Arc's reasons fit easily; the cap
    ///      stops a payee from charging the batch for a huge return buffer.
    uint256 private constant MAX_RETURN = 256;

    bytes32 private constant BLOCKED_REASON = keccak256("Blocked address");
    bytes32 private constant ZERO_REASON = keccak256("Zero address not allowed");

    Stats public stats;

    event Paid(bytes32 indexed ref, address indexed payer, address indexed payee, uint256 amount);
    event Skipped(
        bytes32 indexed ref, address indexed payer, address indexed payee, uint256 amount, Reason reason, string detail
    );
    event Settled(
        bytes32 indexed ref,
        address indexed payer,
        uint256 paidCount,
        uint256 skippedCount,
        uint256 paidValue,
        uint256 refundedValue
    );

    error EmptyBatch();
    error LengthMismatch();
    error ZeroAmount(uint256 index);
    error ValueMismatch(uint256 expected, uint256 received);
    error RefundFailed();

    /// @notice Pays `amounts[i]` native USDC to `payees[i]`, skipping and refunding any
    ///         payee Arc would reject. `msg.value` must equal the sum of `amounts`.
    /// @param ref Free-form batch reference (payroll run id, invoice hash); indexed in every event.
    /// @return paidValue     Total sent to payees.
    /// @return refundedValue Total returned to `msg.sender` for skipped payees.
    function payMany(address[] calldata payees, uint256[] calldata amounts, bytes32 ref)
        external
        payable
        returns (uint256 paidValue, uint256 refundedValue)
    {
        uint256 n = payees.length;
        if (n == 0) revert EmptyBatch();
        if (n != amounts.length) revert LengthMismatch();

        uint256 total;
        for (uint256 i; i < n; ++i) {
            if (amounts[i] == 0) revert ZeroAmount(i);
            total += amounts[i];
        }
        if (total != msg.value) revert ValueMismatch(total, msg.value);

        uint256 skippedCount;
        for (uint256 i; i < n; ++i) {
            address payee = payees[i];
            uint256 amount = amounts[i];
            (Reason reason, string memory detail) = _pay(payee, amount);
            if (reason == Reason.None) {
                paidValue += amount;
                emit Paid(ref, msg.sender, payee, amount);
            } else {
                refundedValue += amount;
                ++skippedCount;
                emit Skipped(ref, msg.sender, payee, amount, reason, detail);
            }
        }

        // Casts cannot truncate: counts are bounded by calldata size and values by msg.value.
        Stats storage s = stats;
        s.batches += 1;
        // forge-lint: disable-next-line(unsafe-typecast)
        s.paidCount += uint64(n - skippedCount);
        // forge-lint: disable-next-line(unsafe-typecast)
        s.skippedCount += uint64(skippedCount);
        // forge-lint: disable-next-line(unsafe-typecast)
        s.paidValue += uint128(paidValue);
        // forge-lint: disable-next-line(unsafe-typecast)
        s.protectedValue += uint128(refundedValue);

        emit Settled(ref, msg.sender, n - skippedCount, skippedCount, paidValue, refundedValue);

        if (refundedValue != 0) {
            (bool ok,) = msg.sender.call{value: refundedValue}("");
            if (!ok) revert RefundFailed();
        }
    }

    /// @notice The static part of a preflight, callable from other contracts: zero address,
    ///         precompile destination, and `USDC.isBlacklisted` on both sides. Arc's runtime
    ///         is still the ground truth; `payMany` also catches whatever it rejects.
    function check(address from, address to) external view returns (Reason) {
        if (to == address(0)) return Reason.ZeroAddress;
        if (isPrecompile(to)) return Reason.Precompile;
        if (isBlacklisted(to) || isBlacklisted(from)) return Reason.Blocklist;
        return Reason.None;
    }

    /// @notice `USDC.isBlacklisted(account)`; false if the predeploy cannot answer.
    function isBlacklisted(address account) public view returns (bool) {
        (bool ok, bytes memory ret) = USDC.staticcall(abi.encodeWithSelector(0xfe575a87, account));
        return ok && ret.length >= 32 && abi.decode(ret, (uint256)) != 0;
    }

    /// @notice Ethereum precompiles 0x01–0x11, P256VERIFY (0x100) and Arc's 0x1800…00–04.
    /// @dev On Arc a value send to 0x01–0x11 succeeds and the USDC is gone; Arc's own
    ///      precompiles revert. Either way it is never a real payee.
    function isPrecompile(address account) public pure returns (bool) {
        uint160 a = uint160(account);
        uint160 arc = uint160(0x1800000000000000000000000000000000000000);
        return (a >= 1 && a <= 0x11) || a == 0x100 || (a >= arc && a <= arc + 4);
    }

    function _pay(address payee, uint256 amount) private returns (Reason, string memory) {
        if (payee == address(0)) return (Reason.ZeroAddress, "Zero address not allowed");
        if (isPrecompile(payee)) return (Reason.Precompile, "Precompile destination");
        if (isBlacklisted(payee)) return (Reason.Blocklist, "Blocked address (USDC.isBlacklisted)");

        bool ok;
        bytes memory ret;
        assembly ("memory-safe") {
            ok := call(PAYEE_GAS, payee, amount, 0, 0, 0, 0)
            let size := returndatasize()
            if gt(size, MAX_RETURN) { size := MAX_RETURN }
            ret := mload(0x40)
            mstore(ret, size)
            returndatacopy(add(ret, 0x20), 0, size)
            mstore(0x40, add(add(ret, 0x20), and(add(size, 31), not(31))))
        }
        if (ok) return (Reason.None, "");

        string memory detail = _errorString(ret);
        bytes32 h = keccak256(bytes(detail));
        if (h == BLOCKED_REASON) return (Reason.Blocklist, detail);
        if (h == ZERO_REASON) return (Reason.ZeroAddress, detail);
        return (Reason.Unknown, bytes(detail).length == 0 ? "execution reverted" : detail);
    }

    /// @dev Decodes `Error(string)` revert data without trusting it: anything malformed or
    ///      truncated yields "" instead of reverting the batch.
    function _errorString(bytes memory ret) private pure returns (string memory) {
        if (ret.length < 68) return "";
        uint256 selector;
        uint256 offset;
        uint256 len;
        assembly ("memory-safe") {
            selector := shr(224, mload(add(ret, 0x20)))
            offset := mload(add(ret, 0x24))
            len := mload(add(ret, 0x44))
        }
        if (selector != 0x08c379a0 || offset != 0x20 || len > ret.length - 68) return "";

        bytes memory out = new bytes(len);
        for (uint256 i; i < len; ++i) {
            out[i] = ret[68 + i];
        }
        return string(out);
    }
}
