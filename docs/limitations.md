# Known Limitations

This document describes the known limitations of the `arc-preflight` SDK.

## 1. Native USDC Only

The preflight probe simulates a **native USDC transfer** (i.e., `msg.value` transfer on Arc where USDC is the native currency). It does **not** simulate ERC-20 `transfer()` calls to a USDC token contract.

On Arc, USDC _is_ the native currency, so this covers the primary use case. However, if a protocol wraps USDC into a different token, the wrapped transfer is not checked.

## 2. Zero-Value Transfers Skip the Check

Transactions with `value: 0` (or `undefined`) bypass the preflight check entirely. This is intentional — Arc's runtime blocklist only triggers on value transfers. Contract calls that move tokens internally (e.g., via `Multicall3`) without a `msg.value` are not caught.

## 3. Sanctions Snapshot Lag

The embedded `data/sanctions.json` file is updated daily via GitHub Actions. There is an inherent lag of up to **24 hours** between when an address is added to a sanctions list and when it appears in the snapshot.

The on-chain probe (`preflight()`) is always real-time and authoritative. The snapshot is a convenience baseline.

## 4. Testnet Blocklist Scope

The Arc Testnet uses a separate, smaller blocklist than mainnet. An address that passes preflight on testnet may still be blocked on mainnet (and vice versa). Always verify against the target network.

## 5. No Routed-Transaction Attribution

Transactions routed through intermediary contracts (e.g., `Multicall3From`, meta-transaction relayers, or account abstraction bundlers) are checked based on the **direct sender** — not the original signer. If a relayer address is clean but the original user is blocked, the preflight check will pass.

## 6. State Override Fallback

Some RPC providers do not support `eth_call` with `stateOverride`. The SDK falls back to a simulated transfer without state overrides in this case. The check remains accurate for blocklist detection, but the fallback path may behave differently for edge cases involving custom contract state.

## 7. Single-Address Check

Each `preflight()` call checks one sender→recipient pair. Batch checking (e.g., "check 100 addresses") requires looping. A future version may add `preflightBatch()`.

## 8. No Historical Lookups

The probe reflects the **current** on-chain blocklist state. It cannot answer "was this address blocked at block N?" — only "is it blocked right now?".
