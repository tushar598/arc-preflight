# Phase 4 Plan: Local Blocklist Cache

## Objective
Implement an optional, event-driven in-memory cache for USDC blocklist events (`Blacklisted`, `UnBlacklisted`) on Arc. This cache enables zero-latency pre-checks, bypassing the `eth_call` probe when a known blocked address is encountered.

---

## Phase 4 Deliverables Checklist

- [ ] Update `src/constants.ts` with USDC ABI snippet for the events.
- [ ] Define `BlocklistCache` interface in `src/types.ts`.
- [ ] Implement `createBlocklistCache` in `src/cache.ts`.
- [ ] Update `preflight()` in `src/adapters/viem.ts` to check the cache.
- [ ] Update `preflightEthers()` in `src/adapters/ethers.ts` to check the cache.
- [ ] Write integration test `tests/cache.test.ts`.
- [ ] Update `src/index.ts` to export the new cache feature.
- [ ] Verify `npm run typecheck` and `npm test` pass.

---

## Plan

### Task 1 — Constants and ABI

**`packages/arc-preflight/src/constants.ts`**
Add the minimal ABI for USDC blocklist events:
```ts
export const USDC_EVENTS_ABI = [
  {
    type: 'event',
    name: 'Blacklisted',
    inputs: [{ name: '_account', type: 'address', indexed: true }]
  },
  {
    type: 'event',
    name: 'UnBlacklisted',
    inputs: [{ name: '_account', type: 'address', indexed: true }]
  }
] as const
```

### Task 2 — Types

**`packages/arc-preflight/src/types.ts`**
```ts
export interface BlocklistCache {
  has(address: string): boolean
  start(): void
  stop(): void
  isRunning: boolean
}

export interface PreflightOptions {
  cache?: BlocklistCache
}
```

### Task 3 — Cache Implementation

**`packages/arc-preflight/src/cache.ts`**
```ts
import { type PublicClient } from 'viem'
import { USDC_ADDRESS, USDC_EVENTS_ABI } from './constants.js'
import { type BlocklistCache } from './types.js'

export function createBlocklistCache(client: PublicClient): BlocklistCache {
  const blocklist = new Set<string>()
  let unwatch: (() => void) | null = null

  return {
    get isRunning() {
      return unwatch !== null
    },
    has(address: string) {
      return blocklist.has(address.toLowerCase())
    },
    start() {
      if (unwatch) return
      unwatch = client.watchContractEvent({
        address: USDC_ADDRESS,
        abi: USDC_EVENTS_ABI,
        onLogs: logs => {
          for (const log of logs) {
            const eventName = log.eventName
            const account = log.args._account?.toLowerCase()
            if (!account) continue

            if (eventName === 'Blacklisted') {
              blocklist.add(account)
            } else if (eventName === 'UnBlacklisted') {
              blocklist.delete(account)
            }
          }
        },
      })
    },
    stop() {
      if (unwatch) {
        unwatch()
        unwatch = null
      }
    }
  }
}
```

### Task 4 — Adapters Update

**`src/adapters/viem.ts` and `src/adapters/ethers.ts`**
In the `preflight()` function, add this check before making the RPC call:
```ts
if (options?.cache?.has(recipient)) {
  return {
    safe: false,
    revertReason: 'Blocked address (cached)',
    gasEstimate: 0n, // Fast path bypasses gas estimation
  }
}
```

### Task 5 — Testing

**`tests/cache.test.ts`**
Test that `createBlocklistCache`:
1. Exposes `has`, `start`, `stop`, `isRunning`.
2. Adds normalized addresses to the set when a mocked `Blacklisted` event fires.
3. Removes addresses on a `UnBlacklisted` event.
4. Test that `preflight(SENDER, BLOCKED_IN_CACHE, client, { cache })` skips the `eth_call` and returns immediately.

---

## Verification Criteria (UAT)

1. `npm test` succeeds for all new cache tests.
2. `createBlocklistCache` is exported via `src/index.ts`.
3. The cache successfully skips the RPC call when an address matches.
