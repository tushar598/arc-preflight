# PreflightPayout

**Batch native-USDC payouts on Arc that never revert because of one bad payee.**

`0xDcCa5d6603Eb63241763665DB4c95f8c8d51BcDA`: the same address on Arc mainnet (5042) and Arc Testnet (5042002). It is deployed through the deterministic CREATE2 deployer, so the address is fixed by the bytecode.

| Network | Deploy | First batch |
|---------|--------|-------------|
| Mainnet | [`0x9f7a…e98f`](https://explorer.arc.io/tx/0x9f7ad1c480683ca82e2d7c83e4a510bdf90764e2c1ea01944f0f1a0bac6ae98f) (1,012,003 gas ≈ 0.020 USDC) | [`0x9862…0536`](https://explorer.arc.io/tx/0x9862253558bae9fdf8e016466ee2f2f11aa66ecdbe90ce9836ebc30e33ab0536): 1 paid, `0x0` refunded |
| Testnet | [`0xd6c4…9099`](https://explorer.testnet.arc.io/tx/0xd6c4d2d31bd3a311a6dcf3832b8bed79b2b53d375ab52a61fcff47134a899099) | [`0xd48c…51e1`](https://explorer.testnet.arc.io/tx/0xd48cd3c89186fc31f6c2bf17d81327575263d0502d6393c887037a3839cd51e1): 2 paid, blocklisted + `0x0` refunded |

## Why it exists

The SDK stops a *single* bad transfer before it is broadcast. A batch is different. Pay 50 people through a normal multicall and have one of them be on Arc's blocklist, and the whole transaction is included, reverts, and burns the gas for all 50. Nobody gets paid.

Inside a contract, Arc's runtime check behaves differently from a top-level send. The inner `CALL` fails and Arc returns its reason (`Blocked address`, `Zero address not allowed`), but the transaction keeps going. This was verified against both public RPCs; see *Verified on Arc* below. `payMany` builds on that:

1. For each payee it checks the zero address, precompiles (`0x01–0x11`, `0x100`, `0x1800…00–04`) and `USDC.isBlacklisted`. These are the same static rules the SDK uses.
2. It sends to each payee that passes, with a 50k gas cap, and catches any runtime rejection.
3. Clean payees are paid. Every skipped amount is refunded to the payer in the same transaction, along with a `Skipped(ref, payer, payee, amount, reason, detail)` event.

Off-chain, `planPayout()` predicts the split before you sign, and the contract enforces it. If an address gets blocklisted between planning and inclusion, the contract still skips it.

## Interface

```solidity
function payMany(address[] payees, uint256[] amounts, bytes32 ref)
    external payable returns (uint256 paidValue, uint256 refundedValue);
function check(address from, address to) external view returns (Reason); // static rules, composable
function stats() external view returns (uint64 batches, uint64 paidCount, uint64 skippedCount,
                                        uint128 paidValue, uint128 protectedValue);

event Paid(bytes32 indexed ref, address indexed payer, address indexed payee, uint256 amount);
event Skipped(bytes32 indexed ref, address indexed payer, address indexed payee, uint256 amount, Reason reason, string detail);
event Settled(bytes32 indexed ref, address indexed payer, uint256 paidCount, uint256 skippedCount, uint256 paidValue, uint256 refundedValue);

enum Reason { None, Blocklist, ZeroAddress, Precompile, BurnForbidden, Unknown } // = SDK reason codes
```

`msg.value` must equal `sum(amounts)`. Amounts are native USDC wei (18 decimals). The call reverts only on malformed input (`EmptyBatch`, `LengthMismatch`, `ZeroAmount`, `ValueMismatch`), when the payer cannot accept the refund (`RefundFailed`), or when the payer is blocked, in which case Arc rejects the top-level send.

## Design notes

- **No owner, no upgrade, no custody.** Each call moves only its own `msg.value` and ends with a balance of zero. The only shared state is the `stats` counters.
- **Hostile payees can't break the batch.** Each payee gets 50k gas, which is enough for smart-account `receive` hooks. Return data is capped at 256 bytes, and `Error(string)` is decoded defensively. The tests cover an infinite loop, a 100 kB revert, a lying length word and re-entry.
- **Why `0x01` is refused up front.** On Arc a value send to an Ethereum precompile *succeeds*, and the USDC is gone. Arc's runtime cannot catch that case, so the contract has to.
- **Stable address.** `bytecode_hash = "none"` and `cbor_metadata = false` mean that editing a comment does not move the address. CI recomputes the address and fails if it drifts from `PREFLIGHT_PAYOUT_ADDRESS` in the SDK.

## Verified on Arc

`eth_call` with the compiled runtime injected by `stateOverride` (`packages/arc-preflight/tests/live/payout.live.test.ts`):

| Network | Payees | Result |
|---------|--------|--------|
| Testnet | clean, `0x7099…79C8` (seeded blocklist), `0x0`, `0x01`, clean | paid 2 of 5; the other 3 were refunded |
| Mainnet | clean, `0xd882…344b` (OFAC SDN) | paid 1, refunded 1 |

## Build, test, deploy

```bash
npm run contracts:test                         # forge test, 12 tests, no forge-std needed
npm run contracts:build                        # artifacts for the live SDK test
PRIVATE_KEY=0x… npm run contracts:deploy -- testnet
npm run contracts:deploy -- mainnet --account arc-deployer   # any cast wallet flags
```

The deploy is idempotent: if code already exists at the address, the script exits with "already deployed". Deploying costs a few cents of USDC gas. Anyone can deploy it, and the result is the same contract at the same address.
