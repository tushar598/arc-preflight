# Known limitations

What `arc-preflight` does not do, so nobody has to find out the hard way.

## 1. Sanctions snapshot: OFAC only, up to a week stale

`data/sanctions.json` contains US OFAC SDN `Digital Currency Address - ETH` entries and nothing else — no EU, no UN, no Arc-specific additions. It refreshes weekly. The three on-chain layers are always live and always run, so a fresh designation that has reached Arc's runtime is still caught; it is just caught by layer 3 or 4 instead of layer 1.

## 2. Testnet and mainnet blocklists differ

The testnet seeds a test address from the standard mnemonic; mainnet enforces the real list. An address that is clean on one network says nothing about the other. Always probe the network you will send on.

## 3. Calldata decoding is allow-listed

The decoder understands ERC-20 `transfer` / `transferFrom`, EIP-3009 `transferWithAuthorization` / `receiveWithAuthorization` (both signature encodings), `Memo.memo(...)`, and `Multicall3From.aggregate / aggregate3 / tryAggregate / blockAndAggregate / tryBlockAndAggregate`, nested up to four levels. Anything else — a DEX router that forwards native value, a vault that pays out internally, an ERC-4337 bundle, a `delegatecall` proxy — is **not** traced. A `value: 0` transaction with calldata the decoder cannot read is passed through unchecked by `withPreflight`, because there is nothing for the runtime blocklist to act on at the top level.

## 4. Inner transfers are simulated as native sends

For an inner ERC-20 transfer the SDK simulates a *native* send between the same pair (with a virtual balance) rather than executing the ERC-20 call, because the ERC-20 path checks balance before the blocklist and would report "exceeds balance" for an unfunded sender. This is the right probe for blocklist, zero-address and precompile rules, but it does not evaluate the token contract's own logic (allowances, pauses, EIP-3009 nonces / signatures).

## 5. Gas for a blocked transfer is a constant

You cannot `eth_estimateGas` a call that reverts. When the verdict is `safe: false`, `gasEstimate` is the documented fallback `USDC_TRANSFER_GAS_ESTIMATE` (34,000 ≈ an ERC-20 USDC transfer). When `safe: true`, it is a live estimate for the exact transaction shape. The "USDC saved" figure in the demo is therefore an estimate at the 20 Gwei minimum base fee, not a measurement.

## 6. Precompile classification is by address, not by cause

`reasonCode: 'PRECOMPILE'` is assigned when the destination is a known precompile (`0x01–0x11`, `0x100`, `0x1800…0000–0004`) *and* the simulation reverted. The revert text is whatever the precompile returned (e.g. `Input too short`). Note that `eth_call` to some Ethereum-standard precompiles with value succeeds on Arc even though a real transaction may not; only reverts are classified.

## 7. No historical lookups

Every layer reflects the current state. "Was this address blocked at block N?" is out of scope.

## 8. RPC dependence

Layers 3 and 4 need a JSON-RPC endpoint that supports `eth_call` (with or without `stateOverride` — the SDK falls back automatically) and `eth_estimateGas`. Rate limits and outages surface as thrown errors from `preflight()`; `withPreflight` propagates them rather than silently allowing the send.

## 9. The local cache only knows what it has seen

`createBlocklistCache()` starts empty unless you give it `lookbackBlocks` / `fromBlock`. Backfill is capped (`maxLookbackBlocks`, default 100,000) and chunked; a failed chunk is reported via `onBackfillError` and skipped. Treat it as an accelerator, never as the source of truth — the SDK never lets a cache *miss* skip the later layers.

## 10. PreflightPayout scope

- **Native USDC only.** `payMany` moves `msg.value` (18 decimals). ERC-20-interface payouts, and payouts of other tokens, are not handled.
- **50,000 gas per payee.** A payee whose `receive` needs more is skipped and refunded (`UNKNOWN`), not paid. That covers every common smart account, but not arbitrary contracts.
- **The payer must accept refunds.** If a skipped amount cannot be returned to `msg.sender`, the whole call reverts with `RefundFailed`. That rules out calling from a contract with no `receive`.
- **Runtime reasons are matched by exact string.** `Blocked address` and `Zero address not allowed` map to `BLOCKLIST` / `ZERO_ADDRESS`. Any other rejection, including a forbidden burn, is reported as `UNKNOWN`, with Arc's text in `detail`.
- **The plan can go stale.** `planPayout()` reflects the chain at planning time. The contract re-checks at execution, so a payee blocked in between is skipped rather than paid. A payee *unblocked* in between is paid only if it was included in the transaction (`includeSkipped: true`).
- **Deployment is per network.** The address is the same everywhere, but it has code only where someone has deployed it. `readPayoutStats()` returns `null` on a network with no deployment.

