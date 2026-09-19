# arc-preflight

**Simulate Arc's protocol blocklist (and the other native-transfer traps) before you spend USDC gas.**

[![CI](https://github.com/tushar598/arc-preflight/actions/workflows/ci.yml/badge.svg)](https://github.com/tushar598/arc-preflight/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/arc-preflight.svg)](https://www.npmjs.com/package/arc-preflight)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Live demo (Arc mainnet, chain 5042):** `https://arc-preflight.vercel.app` — one-click blocked path at `/demo` *(URL is set at deploy time; see [JUDGES.md](JUDGES.md))*

```bash
npm i arc-preflight viem
# or, no code at all:
npx arc-preflight 0xd882cFc20F52f2599D84b8e8D58C7FB62cfE344b
```

## Why Arc is different

On Arc, USDC is the native gas token and the **blocklist is enforced by the protocol at runtime**. A value transfer to or from a blocklisted address is *included in a block, reverts, and still consumes gas*. There is no mempool rejection to save you. Wallets lose fees; autonomous agents burn through retry loops paying for every attempt.

The same runtime also reverts value sends to the zero address, to precompiles, and to self-destructed accounts (a forbidden burn). None of these are visible from `USDC.balanceOf()`.

## Why `isBlacklisted()` alone is not enough

Arc's docs tell exchanges to call `USDC.isBlacklisted(addr)` before withdrawals. That is a good first check and arc-preflight runs it — but it only answers one question. It says nothing about the zero address, precompile destinations, forbidden burns, or an address that is blocked at the runtime level but not through the FiatToken contract. And it doesn't look inside calldata: a `Multicall3From.aggregate3()` payroll batch with one bad recipient passes a naive check on `tx.to` and then reverts on-chain.

arc-preflight's last layer is an `eth_call` of the **native value transfer itself**, with a virtual sender balance via `stateOverride`. It takes the exact path a real transaction takes, so whatever the runtime would reject, the simulation rejects first — for free, and without a funded account.

## Quickstart (viem)

```ts
import { createWalletClient, createPublicClient, http } from 'viem'
import { withPreflight, PreflightError, ARC_MAINNET_RPC_URL } from 'arc-preflight'

const publicClient = createPublicClient({ transport: http(ARC_MAINNET_RPC_URL) })
const wallet = withPreflight(createWalletClient({ /* account, chain */ transport: http(ARC_MAINNET_RPC_URL) }), publicClient)

try {
  await wallet.sendTransaction({ to, value })          // checked first; throws before broadcast if it would revert
} catch (err) {
  if (err instanceof PreflightError) {
    console.log(err.reasonCode, err.layer, err.revertReason) // BLOCKLIST isBlacklisted "Blocked address (…)"
  }
}
```

One-shot check without wrapping a wallet:

```ts
const r = await preflight(sender, recipient, publicClient)
// { safe: false, reasonCode: 'BLOCKLIST', layer: 'sanctions', revertReason: 'Blocked address (OFAC SDN: 0x…)', gasEstimate: 34000n, recipientsChecked: ['0x…'] }
```

## What runs, in order

| # | Layer | What it is | Cost |
|---|-------|------------|------|
| 1 | `sanctions` | Embedded OFAC SDN snapshot (ETH addresses only, refreshed weekly by CI) | 0 RPC, sync |
| 2 | `cache` | Optional local cache of USDC `Blacklisted` / `UnBlacklisted` events, with `eth_getLogs` backfill | 0 RPC per check |
| 3 | `isBlacklisted` | `USDC.isBlacklisted(sender)` and `(recipient)` on the predeploy at `0x3600…0000` | 2 `eth_call` |
| 4 | `simulation` | `eth_call` of the native send with `stateOverride`; falls back to a plain call if the RPC rejects overrides | 1–2 `eth_call` + `eth_estimateGas` |

Layers 1–3 can only *prove* a blocklist hit and short-circuit when they do. Layer 4 always runs otherwise — it is ground truth for `ZERO_ADDRESS`, `PRECOMPILE` and `BURN_FORBIDDEN` too.

**Calldata is decoded.** ERC-20 `transfer` / `transferFrom` / EIP-3009 authorizations, `Memo.memo(...)` wrappers and every `Multicall3From` aggregate variant are unwrapped, and each inner sender→recipient pair goes through the same four layers. A `value: 0` transaction that moves USDC is still guarded. Memo and Multicall3From route through the CallFrom precompile, so inner transfers are attributed to the original sender.

## Exports

| Export | Purpose |
|--------|---------|
| `preflight(sender, recipient, publicClient, opts?)` | One check → `PreflightResult` |
| `preflightMany(sender, recipients[], publicClient, opts?)` | Batch with concurrency limit → `{ results, safeCount, blockedCount }` |
| `withPreflight(walletClient, publicClient, opts?)` | Proxy that guards `sendTransaction`, calldata-aware; throws `PreflightError` |
| `preflightEthers` / `preflightManyEthers` / `withPreflightEthers` | Same for ethers v6 (`JsonRpcProvider` / `Signer`) |
| `checkSanctions(addr)`, `sanctionsVersion`, `sanctionsCount`, `sanctionsScope` | Offline OFAC SDN lookup |
| `createBlocklistCache(publicClient, { lookbackBlocks?, fromBlock?, chunkSize? })` | Event cache with backfill; `has()`, `size`, `startedAt`, `start()`, `stop()` |
| `decodeTransferIntents(tx)` | The calldata decoder on its own |
| `runPreflight`, `probe`, `httpTransport`, `transportFromViem`, `transportFromEthers` | Engine + transports for any JSON-RPC client |
| `extractRevertReason`, `classifyRevert`, `isPrecompileAddress` | Revert helpers |
| `PreflightError` | `.revertReason`, `.reasonCode`, `.layer`, `.result` |
| Constants | Chain IDs, public RPC/explorer URLs, `USDC_ADDRESS`, `MEMO_ADDRESS`, `MULTICALL3FROM_ADDRESS`, `SYSTEM_EMITTER_ADDRESS`, `CALLFROM_PRECOMPILE_ADDRESS`, `NATIVE_COIN_CONTROL_PRECOMPILE_ADDRESS`, `TESTNET_BLOCKLISTED_ADDRESS`, `MAINNET_DEMO_BLOCKED_ADDRESS`, `MIN_BASE_FEE_WEI`, ABIs |

`PreflightResult`:

```ts
{
  safe: boolean
  revertReason: string | null
  reasonCode?: 'BLOCKLIST' | 'ZERO_ADDRESS' | 'PRECOMPILE' | 'BURN_FORBIDDEN' | 'INSUFFICIENT_FUNDS' | 'UNKNOWN'
  layer?: 'sanctions' | 'cache' | 'isBlacklisted' | 'simulation'
  gasEstimate: bigint          // live eth_estimateGas when safe; 34_000 fallback when it would revert
  recipientsChecked?: Address[]
}
```

### CLI

```
npx arc-preflight <recipient> [--from 0x..] [--chain mainnet|testnet] [--rpc url] [--value wei] [--data 0x..] [--json]
```

Exit code `0` = safe, `1` = blocked, `2` = bad input. Default RPC is the public Arc mainnet endpoint. No API key.

## Limitations, honestly

Full list in [docs/limitations.md](docs/limitations.md). The short version:

- The sanctions snapshot is **OFAC SDN only** (no EU/UN) and lags up to a week. On-chain layers are always live.
- Testnet and mainnet blocklists differ. The demo defaults to mainnet.
- Only calldata shapes the decoder knows (ERC-20, EIP-3009, Memo, Multicall3From) are unwrapped. Arbitrary contract calls that move USDC internally, account-abstraction bundles and nested delegatecalls are not traced.
- The gas figure for a *blocked* transfer is a documented constant (34,000) because a reverting call cannot be estimated. Safe transfers get a live estimate.
- No historical "was it blocked at block N" query.

## Repository

```
packages/arc-preflight/   the SDK (npm: arc-preflight) — src/, tests/unit (offline), tests/live (Arc Testnet, LIVE_RPC=1)
app/ components/ lib/     the Next.js demo, deployed against Arc mainnet public RPC; /demo deep link
scripts/sync-lists.ts     OFAC SDN → data/sanctions.json (weekly GitHub Action)
docs/                     data-sources.md, limitations.md, submission.md
JUDGES.md                 60-second click path
NEXT-STEPS.md             how to test, deploy, publish, submit
```

Local:

```bash
npm ci               # .npmrc sets legacy-peer-deps for the RainbowKit/wagmi pair
npm run sdk:test     # 67 offline unit tests
npm run dev          # builds the SDK, then next dev → http://localhost:3000 (/demo for the blocked path)
```

Deploy: any static host. Build command `npm run build` (builds the SDK then the app), no environment variables required; `NEXT_PUBLIC_WALLETCONNECT_ID` is optional for WalletConnect.

## License

MIT
