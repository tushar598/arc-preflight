# Phase 3 Plan: Integration Tests + Ethers Adapter + Sanctions Data

## Objective

Ship three deliverables that strengthen and complete the core SDK:

1. **vitest integration test suite** — live Arc Testnet calls proving `preflight()` and `withPreflight()` work end-to-end
2. **Ethers v6 adapter** (`preflightEthers`, `withPreflightEthers`) — symmetric to the existing Viem adapter
3. **OFAC sanctions data** — `sync-lists.ts` fetches the SDN XML, extracts Ethereum addresses, writes `data/sanctions.json`; a `checkSanctions()` function exposes it in the SDK

---

## Phase 3 Deliverables Checklist

- [ ] Install vitest + ethers devDependencies
- [ ] `vitest.config.ts` in SDK package
- [ ] `tests/preflight.test.ts` — 4 live testnet integration tests
- [ ] `src/adapters/ethers.ts` — Ethers v6 adapter
- [ ] `src/sanctions.ts` — `checkSanctions()` function
- [ ] `data/sanctions.json` — generated OFAC ETH addresses snapshot
- [ ] `scripts/sync-lists.ts` — OFAC XML fetch + parse + write
- [ ] Update `src/constants.ts` — add `MAINNET_DEMO_BLOCKED_ADDRESS`
- [ ] Update `src/index.ts` — export ethers adapter + `checkSanctions`
- [ ] Update `package.json` — add vitest scripts, ethers peer dep
- [ ] `.github/workflows/sync-sanctions.yml` — GitHub Action on PR merge
- [ ] Rebuild `dist/`
- [ ] All 4 vitest tests pass

---

## Plan

### Task 1 — Install dependencies

```bash
npm install --save-dev vitest@^5.0.1 ethers@^6.17.0 \
  --workspace=arc-preflight
```

Update `packages/arc-preflight/package.json`:
- `devDependencies`: add `vitest ^5.0.1`, `ethers ^6.17.0`
- `peerDependencies`: add `ethers >=6.0.0` as optional
- `scripts`: add `"test": "vitest run"`, `"test:watch": "vitest"`

---

### Task 2 — vitest config

**`packages/arc-preflight/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 20_000,   // Arc Testnet RPC can be slow
    hookTimeout: 10_000,
    include: ['tests/**/*.test.ts'],
  },
})
```

---

### Task 3 — Integration tests

**`packages/arc-preflight/tests/preflight.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { createPublicClient, http } from 'viem'
import {
  preflight, withPreflight, PreflightError,
  TESTNET_BLOCKLISTED_ADDRESS, ARC_TESTNET_RPC_URL,
} from '../src/index.js'

const client = createPublicClient({
  transport: http(ARC_TESTNET_RPC_URL),
})

const SENDER  = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const CLEAN   = '0x1111111111111111111111111111111111111111'
const BLOCKED = TESTNET_BLOCKLISTED_ADDRESS

describe('preflight() — Arc Testnet live', () => {
  it('returns safe:true for a clean recipient', async () => {
    const result = await preflight(SENDER, CLEAN, client)
    expect(result.safe).toBe(true)
    expect(result.revertReason).toBeNull()
    expect(result.gasEstimate).toBeTypeOf('bigint')
  })

  it('returns safe:false with "Blocked address" for blocklisted recipient', async () => {
    const result = await preflight(SENDER, BLOCKED, client)
    expect(result.safe).toBe(false)
    expect(result.revertReason).toBe('Blocked address')
  })

  it('withPreflight throws PreflightError for blocklisted recipient', async () => {
    const mockWallet = {
      account: SENDER,
      sendTransaction: async () => '0xhash',
    } as any
    const guarded = withPreflight(mockWallet, client)
    await expect(
      guarded.sendTransaction({ to: BLOCKED, value: 1n }),
    ).rejects.toThrow(PreflightError)
  })

  it('withPreflight passes clean recipient through to wallet', async () => {
    let called = false
    const mockWallet = {
      account: SENDER,
      sendTransaction: async () => { called = true; return '0xhash' },
    } as any
    const guarded = withPreflight(mockWallet, client)
    const hash = await guarded.sendTransaction({ to: CLEAN, value: 1n })
    expect(called).toBe(true)
    expect(hash).toBe('0xhash')
  })
})
```

---

### Task 4 — Ethers v6 adapter

**`packages/arc-preflight/src/adapters/ethers.ts`**

Implements the same native-value-send probe, but using ethers v6 `JsonRpcProvider`.

Key implementation note for the probe with state override:
```ts
// ethers v6 does not expose stateOverride through provider.call()
// Must use raw RPC call:
const stateOverride = {
  [sender]: { balance: '0xD3C21BCECCEDA1000000' } // 10^24 wei hex
}
const result = await provider.send('eth_call', [
  { from: sender, to: recipient, value: '0x1' },
  'latest',
  stateOverride,
])
```

Fallback: if `provider.send` is not available (read-only provider), retry without state override.

Exports:
```ts
export async function preflightEthers(
  sender: string,
  recipient: string,
  provider: JsonRpcProvider,
  options?: PreflightOptions,
): Promise<PreflightResult>

export function withPreflightEthers(
  signer: Signer,
  provider: JsonRpcProvider,
  options?: PreflightOptions,
): typeof signer & { __preflight: true }
```

The `withPreflightEthers` wraps `signer.sendTransaction` with a JS `Proxy`, identical pattern to the Viem adapter.

---

### Task 5 — Update constants.ts

Add to `packages/arc-preflight/src/constants.ts`:

```ts
/**
 * A known OFAC-sanctioned Ethereum address that is blocklisted on Arc Mainnet.
 * Lazarus Group mixer address — confirmed blocked on Arc Mainnet RPC.
 * Use this in demo/testing against mainnet.
 * Source: OFAC SDN list + confirmed via eth_call on rpc.mainnet.arc.io
 */
export const MAINNET_DEMO_BLOCKED_ADDRESS =
  '0xd882cFc20F52f2599D84b8e8D58C7FB62cfE344b' as const
```

---

### Task 6 — OFAC sync script

**`scripts/sync-lists.ts`**

```ts
// Fetches OFAC SDN XML, extracts Ethereum addresses, writes data/sanctions.json
// Usage: npx tsx scripts/sync-lists.ts

const OFAC_URL = 'https://sanctionslistservice.ofac.treas.gov/api/publicationpreview/exports/sdn.xml'
```

XML parsing approach: stream the XML text, use regex to find:
```
<id>
  <idType>Digital Currency Address - ETH</idType>
  <idNumber>0x...</idNumber>
</id>
```

Pattern: `/Digital Currency Address - ETH<\/idType>\s*<idNumber>(0x[a-fA-F0-9]{40})<\/idNumber>/g`

Output format:
```json
{
  "version": "2026-09-19",
  "source": "OFAC SDN",
  "count": 423,
  "addresses": ["0x...", "0x..."]
}
```

Script outputs to `packages/arc-preflight/data/sanctions.json`.

---

### Task 7 — sanctions.ts module

**`packages/arc-preflight/src/sanctions.ts`**

```ts
import sanctionsData from '../data/sanctions.json' assert { type: 'json' }

const SANCTIONS_SET = new Set(
  (sanctionsData.addresses as string[]).map(a => a.toLowerCase())
)

/**
 * Checks whether an address appears on the OFAC SDN sanctions list
 * (Ethereum addresses only). This is an offline check — no network call.
 *
 * Returns true if the address is sanctioned.
 * Does NOT replace the eth_call preflight probe — use both in sequence.
 */
export function checkSanctions(address: string): boolean {
  return SANCTIONS_SET.has(address.toLowerCase())
}

export const sanctionsVersion = sanctionsData.version as string
export const sanctionsCount = sanctionsData.count as number
```

---

### Task 8 — Update index.ts

Add to `packages/arc-preflight/src/index.ts`:
```ts
// Ethers adapter
export { preflightEthers, withPreflightEthers } from './adapters/ethers.js'

// Sanctions data
export { checkSanctions, sanctionsVersion, sanctionsCount } from './sanctions.js'

// Additional constants
export { MAINNET_DEMO_BLOCKED_ADDRESS } from './constants.js'
```

---

### Task 9 — GitHub Action

**`.github/workflows/sync-sanctions.yml`**

```yaml
name: Sync OFAC Sanctions List

on:
  pull_request:
    types: [closed]

jobs:
  sync:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - name: Sync OFAC sanctions list
        run: npx tsx scripts/sync-lists.ts
        continue-on-error: true
      - name: Commit updated sanctions.json
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git diff --quiet packages/arc-preflight/data/sanctions.json || (
            git add packages/arc-preflight/data/sanctions.json &&
            git commit -m "chore: update OFAC sanctions list [skip ci]" &&
            git push
          )
```

---

### Task 10 — Rebuild + verify

```bash
# Rebuild with new exports
npm run build -w arc-preflight

# Run live integration tests
npm test -w arc-preflight
```

Expected output: 4 tests pass, build succeeds, `dist/index.d.ts` has new exports.

---

## Verification Criteria (UAT)

| # | Check | Expected |
|---|-------|----------|
| 1 | `vitest run` exits 0 | 4/4 tests pass |
| 2 | `preflightEthers` type-checks | No TS errors |
| 3 | `checkSanctions('0xd882cFc...')` | `true` (OFAC address present in JSON) |
| 4 | `checkSanctions('0x1111...')` | `false` |
| 5 | `data/sanctions.json` has `addresses` array | Length > 100 |
| 6 | `dist/index.d.ts` exports `preflightEthers`, `checkSanctions`, `MAINNET_DEMO_BLOCKED_ADDRESS` | Present |
| 7 | GitHub Action YAML is valid | No syntax errors |

---

## Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| OFAC XML endpoint slow/down | `continue-on-error: true` in GitHub Action; existing JSON unchanged on failure |
| ethers v6 `provider.send` not available on some providers | Fallback retry without stateOverride |
| `import ... assert { type: 'json' }` not supported in all bundlers | tsup handles it; add `resolveJsonModule: true` to tsconfig if needed |
| Testnet RPC latency in CI | `testTimeout: 20_000` in vitest config |
