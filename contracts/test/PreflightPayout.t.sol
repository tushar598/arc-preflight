// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {PreflightPayout} from "../src/PreflightPayout.sol";

/// Only the cheatcodes these tests use; keeps the project free of forge-std.
interface Vm {
    function etch(address target, bytes calldata code) external;
    function deal(address account, uint256 balance) external;
    function prank(address sender) external;
    function expectRevert(bytes calldata revertData) external;
    function expectEmit(bool t1, bool t2, bool t3, bool data, address emitter) external;
}

/// Stands in for the USDC predeploy at 0x3600…0000.
contract MockUSDC {
    mapping(address => bool) public isBlacklisted;

    function setBlacklisted(address a, bool v) external {
        isBlacklisted[a] = v;
    }
}

/// Behaves like an address Arc's runtime rejects without a FiatToken blacklist entry.
contract RuntimeBlocked {
    receive() external payable {
        revert("Blocked address");
    }
}

contract GasGuzzler {
    receive() external payable {
        while (true) {}
    }
}

contract ReturnBomb {
    receive() external payable {
        assembly {
            revert(0, 100000)
        }
    }
}

/// Error(string) selector with a length word far larger than the data.
contract LyingRevert {
    receive() external payable {
        assembly {
            mstore(0, shl(224, 0x08c379a0))
            mstore(4, 0x20)
            mstore(36, 0xffffffff)
            revert(0, 68)
        }
    }
}

contract Reenter {
    PreflightPayout internal immutable payout;

    constructor(PreflightPayout p) {
        payout = p;
    }

    receive() external payable {
        if (msg.value > 1) {
            address[] memory to = new address[](1);
            to[0] = address(0xBEEF);
            uint256[] memory amt = new uint256[](1);
            amt[0] = 1;
            payout.payMany{value: 1}(to, amt, bytes32(0));
        }
    }
}

contract NoReceive {
    function pay(PreflightPayout p, address[] calldata to, uint256[] calldata amt) external payable {
        p.payMany{value: msg.value}(to, amt, bytes32(0));
    }
}

contract PreflightPayoutTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address internal constant USDC = 0x3600000000000000000000000000000000000000;
    bytes32 internal constant REF = keccak256("payroll-2026-09");

    PreflightPayout internal payout;
    MockUSDC internal usdc;
    address internal payer = address(0xA11CE);

    function setUp() public {
        vm.etch(USDC, address(new MockUSDC()).code);
        usdc = MockUSDC(USDC);
        payout = new PreflightPayout();
        vm.deal(payer, 100 ether);
    }

    // --- helpers ---------------------------------------------------------

    function _pay(address[] memory to, uint256[] memory amt) internal returns (uint256 paid, uint256 refunded) {
        uint256 total;
        for (uint256 i; i < amt.length; ++i) {
            total += amt[i];
        }
        vm.prank(payer);
        (paid, refunded) = payout.payMany{value: total}(to, amt, REF);
    }

    function _ones(uint256 n) internal pure returns (uint256[] memory a) {
        a = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            a[i] = 1 ether;
        }
    }

    function _eq(uint256 a, uint256 b, string memory what) internal pure {
        if (a != b) revert(string.concat(what, ": mismatch"));
    }

    // --- happy path ------------------------------------------------------

    function test_paysEveryCleanPayee() public {
        address[] memory to = new address[](3);
        to[0] = address(0xB0B);
        to[1] = address(0xCA11);
        to[2] = address(0xD00D);

        (uint256 paid, uint256 refunded) = _pay(to, _ones(3));

        _eq(paid, 3 ether, "paid");
        _eq(refunded, 0, "refunded");
        _eq(address(0xB0B).balance, 1 ether, "b0b");
        _eq(payer.balance, 97 ether, "payer");
        _eq(address(payout).balance, 0, "contract holds nothing");
        (uint64 batches, uint64 paidCount, uint64 skippedCount, uint128 paidValue, uint128 protectedValue) =
            payout.stats();
        _eq(batches, 1, "batches");
        _eq(paidCount, 3, "paidCount");
        _eq(skippedCount, 0, "skippedCount");
        _eq(paidValue, 3 ether, "paidValue");
        _eq(protectedValue, 0, "protectedValue");
    }

    // --- skip and refund -------------------------------------------------

    function test_skipsFiatTokenBlacklistedPayeeAndRefunds() public {
        address bad = address(0xBAD);
        usdc.setBlacklisted(bad, true);
        address[] memory to = new address[](3);
        to[0] = address(0xB0B);
        to[1] = bad;
        to[2] = address(0xD00D);

        vm.expectEmit(true, true, true, true, address(payout));
        emit PreflightPayout.Skipped(
            REF, payer, bad, 1 ether, PreflightPayout.Reason.Blocklist, "Blocked address (USDC.isBlacklisted)"
        );
        (uint256 paid, uint256 refunded) = _pay(to, _ones(3));

        _eq(paid, 2 ether, "paid");
        _eq(refunded, 1 ether, "refunded");
        _eq(bad.balance, 0, "bad got nothing");
        _eq(payer.balance, 98 ether, "payer refunded");
        _eq(address(payout).balance, 0, "contract holds nothing");
        (,, uint64 skippedCount,, uint128 protectedValue) = payout.stats();
        _eq(skippedCount, 1, "skippedCount");
        _eq(protectedValue, 1 ether, "protectedValue");
    }

    function test_catchesRuntimeRejectionWithArcReason() public {
        RuntimeBlocked bad = new RuntimeBlocked();
        address[] memory to = new address[](2);
        to[0] = address(bad);
        to[1] = address(0xB0B);

        vm.expectEmit(true, true, true, true, address(payout));
        emit PreflightPayout.Skipped(
            REF, payer, address(bad), 1 ether, PreflightPayout.Reason.Blocklist, "Blocked address"
        );
        (uint256 paid, uint256 refunded) = _pay(to, _ones(2));

        _eq(paid, 1 ether, "paid");
        _eq(refunded, 1 ether, "refunded");
    }

    function test_skipsZeroAddressAndPrecompilesWithoutLosingFunds() public {
        address[] memory to = new address[](5);
        to[0] = address(0);
        to[1] = address(0x01); // ecrecover: a send would succeed and the USDC would be gone
        to[2] = address(0x100);
        to[3] = 0x1800000000000000000000000000000000000001;
        to[4] = address(0xB0B);

        (uint256 paid, uint256 refunded) = _pay(to, _ones(5));

        _eq(paid, 1 ether, "paid");
        _eq(refunded, 4 ether, "refunded");
        _eq(address(0x01).balance, 0, "precompile got nothing");
        _eq(payer.balance, 99 ether, "payer");
    }

    function test_hostilePayeesCannotBreakTheBatch() public {
        address[] memory to = new address[](4);
        to[0] = address(new GasGuzzler());
        to[1] = address(new ReturnBomb());
        to[2] = address(new LyingRevert());
        to[3] = address(0xB0B);

        vm.expectEmit(true, true, true, true, address(payout));
        emit PreflightPayout.Skipped(REF, payer, to[2], 1 ether, PreflightPayout.Reason.Unknown, "execution reverted");
        (uint256 paid, uint256 refunded) = _pay(to, _ones(4));

        _eq(paid, 1 ether, "paid");
        _eq(refunded, 3 ether, "refunded");
        _eq(address(0xB0B).balance, 1 ether, "clean payee still paid");
    }

    function test_reentrantPayeeRunsOutOfGasAndIsRefunded() public {
        Reenter r = new Reenter(payout);
        address[] memory to = new address[](2);
        to[0] = address(r);
        to[1] = address(0xB0B);

        (uint256 paid, uint256 refunded) = _pay(to, _ones(2));

        // A nested payMany needs far more than PAYEE_GAS, so the re-entry fails, the
        // payee is skipped, and nothing about the outer batch changes.
        _eq(paid, 1 ether, "paid");
        _eq(refunded, 1 ether, "refunded");
        _eq(address(r).balance, 0, "reenterer got nothing");
        _eq(address(0xBEEF).balance, 0, "no nested payout");
        _eq(address(payout).balance, 0, "contract holds nothing");
        (uint64 batches,,,,) = payout.stats();
        _eq(batches, 1, "one batch");
    }

    // --- input validation ------------------------------------------------

    function test_revertsOnValueMismatch() public {
        address[] memory to = new address[](1);
        to[0] = address(0xB0B);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(PreflightPayout.ValueMismatch.selector, 1 ether, 2 ether));
        payout.payMany{value: 2 ether}(to, _ones(1), REF);
    }

    function test_revertsOnLengthMismatch() public {
        address[] memory to = new address[](2);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(PreflightPayout.LengthMismatch.selector));
        payout.payMany{value: 1 ether}(to, _ones(1), REF);
    }

    function test_revertsOnZeroAmount() public {
        address[] memory to = new address[](2);
        uint256[] memory amt = new uint256[](2);
        amt[0] = 1;
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(PreflightPayout.ZeroAmount.selector, 1));
        payout.payMany{value: 1}(to, amt, REF);
    }

    function test_revertsOnEmptyBatch() public {
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(PreflightPayout.EmptyBatch.selector));
        payout.payMany(new address[](0), new uint256[](0), REF);
    }

    function test_revertsWhenRefundCannotBeDelivered() public {
        NoReceive caller = new NoReceive();
        vm.deal(address(caller), 1 ether);
        address[] memory to = new address[](1);
        to[0] = address(0);
        vm.expectRevert(abi.encodeWithSelector(PreflightPayout.RefundFailed.selector));
        caller.pay{value: 1 ether}(payout, to, _ones(1));
    }

    // --- check() ---------------------------------------------------------

    function test_checkMirrorsTheStaticRules() public {
        usdc.setBlacklisted(address(0xBAD), true);
        _eq(uint8(payout.check(payer, address(0xB0B))), uint8(PreflightPayout.Reason.None), "clean");
        _eq(uint8(payout.check(payer, address(0))), uint8(PreflightPayout.Reason.ZeroAddress), "zero");
        _eq(uint8(payout.check(payer, address(0x05))), uint8(PreflightPayout.Reason.Precompile), "precompile");
        _eq(uint8(payout.check(payer, address(0xBAD))), uint8(PreflightPayout.Reason.Blocklist), "to blocked");
        _eq(
            uint8(payout.check(address(0xBAD), address(0xB0B))), uint8(PreflightPayout.Reason.Blocklist), "from blocked"
        );
    }
}
