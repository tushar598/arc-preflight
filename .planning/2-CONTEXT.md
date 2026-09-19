# Phase 2 Context: Core SDK — Probe & Viem Adapter

## Decisions Carried Forward from Phase 1 UAT

### Critical: Probe mechanism uses NATIVE send, not ERC-20 transfer
- **Decision:** `preflight()` simulates a **native USDC send** (`value: 1n`) via `client.call()`.
- **Reason:** Arc's `runtime-transfer-check` fires on the native value path. ERC-20 `transfer()` checks balance first — it does NOT gate on the blocklist.
- **Implementation:** `client.call({ account: sender, to: recipient, value: 1n })`

### USDC Decimals
- Native: 18 decimals. ERC-20 interface: 6 decimals.
- The probe uses `value: 1n` (1 wei of native USDC) — no decimal conversion needed.

## Decisions Made in Discussion

### SDK Structure: npm workspace package
- **Decision:** Create `packages/arc-preflight/` as an npm workspace package.
- **Reason:** Clean separation of publishable SDK from Next.js demo. Workspace link allows the demo to `import 'arc-preflight'` during development.

### `preflight()` Signature
```ts
preflight(sender: Address, recipient: Address, client: PublicClient): Promise<PreflightResult>
```
- Pure function, no hidden state, caller controls the client.

### `PreflightResult` Type
```ts
type PreflightResult = {
  safe: boolean           // true = transfer will succeed
  revertReason: string | null  // null when safe
  gasEstimate: bigint     // estimated gas units for a successful transfer
}
```

### Testing Strategy
- Phase 2: Code and types only. No tests yet.
- Phase 3: Vitest + arc-anvil integration tests.

## Scope for Phase 2
1. `packages/arc-preflight/src/types.ts` — `PreflightResult`, `PreflightOptions`
2. `packages/arc-preflight/src/probe.ts` — native-send `eth_call` probe
3. `packages/arc-preflight/src/adapters/viem.ts` — Viem PublicClient adapter
4. `packages/arc-preflight/src/index.ts` — public entry: exports `preflight()` and `withPreflight()`
5. `packages/arc-preflight/package.json` — workspace package manifest
6. `packages/arc-preflight/tsconfig.json` — TS config for the SDK
7. Root `package.json` — add workspaces field
