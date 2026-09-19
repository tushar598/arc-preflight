# Phase 4 Context: Local Blocklist Cache

## Summary

Phase 4 introduces an optional, long-lived local cache that tracks on-chain `Blacklisted` and `UnBlacklisted` events emitted by the USDC contract. This allows high-frequency callers to keep a local replica of the blocklist state in-memory, acting as an ultra-fast pre-check before falling back to the `eth_call` probe for safety.

---

## Decisions Locked

### Cache Architecture

- **Mechanism:** Viem's `watchContractEvent` API.
  - Subscribes to the USDC contract (`0x3600...`).
  - Supports both WebSockets (WSS) and HTTP polling depending on the provided Viem client's transport.
- **Storage:** In-memory JavaScript `Set<Address>`.
  - Clears on restart (stateless by design).
  - Lookups are synchronous and O(1).
- **Target Events:**
  - `Blacklisted(address indexed _account)` → adds to Set.
  - `UnBlacklisted(address indexed _account)` → removes from Set.
  - *Note on spelling: The FiatTokenV2 standard uses "Blacklisted", not "Blocklisted", in its event signatures.*

### SDK Integration

- **API Surface:** Standalone function `createBlocklistCache(client)`.
  - Returns a cache object: `{ has(address), start(), stop(), isRunning }`.
  - Caller explicitly manages the lifecycle (starting and stopping the listener).
- **Location:** `packages/arc-preflight/src/cache.ts`
- **preflight() Integration:**
  - Update `PreflightOptions` to accept an optional `cache` instance.
  - If a `cache` is provided to `preflight()` or `withPreflight()`, the SDK checks it synchronously *before* making the `eth_call` probe.
  - If `cache.has(recipient)` returns true, `preflight()` immediately returns `safe: false` without hitting the RPC.

### Code Details

- Add USDC ABI snippet for the two events to `src/constants.ts` or `src/cache.ts`.
- Ensure address normalisation (lowercase) when storing in the Set to avoid case-mismatch bugs.
- Tests will mock `client.watchContractEvent` to verify that the Set updates correctly when simulated events fire.

---

## Out of Scope for Phase 4

- Persistent storage (e.g., Redis, SQLite, JSON files). The cache remains strictly in-memory.
- Automatic startup. The cache must be explicitly instantiated and started by the developer to avoid unmanaged background network connections.
- Demo Page deployment (Phase 5).
