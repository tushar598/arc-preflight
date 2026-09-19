# Phase 2 Context: Core SDK — Probe & Viem Adapter

## Decisions Carried Forward from Phase 1 UAT

### Critical: Probe mechanism uses NATIVE send, not ERC-20 transfer
- **Decision:** The `preflight()` probe MUST simulate a **native USDC send** (`msg.value`), not `USDC.transfer()`.
- **Reason:** Arc's `runtime-transfer-check` blocklist enforcement fires on the **native value transfer path**. The ERC-20 `transfer()` function checks balance first — it does NOT gate on the blocklist.
- **Implementation:** Use `client.call({ account: sender, to: recipient, value: 1n })` for the probe.

### USDC Decimal Handling
- Native USDC: 18 decimals (for `msg.value`, gas, `block.basefee`)
- ERC-20 USDC: 6 decimals (for `transfer`, `balanceOf`, display)
- The probe uses native value path, so work in 18-decimal precision.

### Known Blocklisted Test Address
- Testnet: `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`
- Private key derivable from mnemonic index 1: `test test test test test test test test test test test junk`

### arc-anvil Requirement
- All tests MUST run against `arc-anvil --network arc` (not standard `anvil`)
- Standard anvil cannot reproduce `runtime-transfer-check` reverts

## Scope for Phase 2
1. `src/probe.ts` — core `eth_call` preflight function using native send
2. `src/adapters/viem.ts` — Viem wallet client adapter
3. `src/types.ts` — shared TypeScript types (`PreflightResult`, `PreflightOptions`)
4. `src/index.ts` — public package entry point exporting `preflight()` and `withPreflight()`
5. Vitest unit tests running against arc-anvil
