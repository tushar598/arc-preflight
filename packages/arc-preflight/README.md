# arc-preflight

> Simulate Arc's protocol blocklist — and the other native-transfer traps — before you spend USDC gas.

On Arc, a USDC transfer to a blocklisted address is included, reverts, and still costs gas. `arc-preflight` runs four layers — an offline OFAC SDN snapshot, an optional local event cache, `USDC.isBlacklisted()`, and an `eth_call` simulation of the native send with `stateOverride` — and tells you before you broadcast. No backend, no API key. Calldata is decoded, so an ERC-20 `transfer()`, a `Memo.memo()` wrapper or a `Multicall3From.aggregate3()` batch is guarded too.

```bash
npm i arc-preflight viem      # ethers v6 also supported
npx arc-preflight 0xd882cFc20F52f2599D84b8e8D58C7FB62cfE344b   # CLI, mainnet, no key
```

## Viem

```ts
import { createWalletClient, createPublicClient, http } from 'viem'
import { withPreflight, preflight, PreflightError, ARC_MAINNET_RPC_URL } from 'arc-preflight'

const publicClient = createPublicClient({ transport: http(ARC_MAINNET_RPC_URL) })

// One-shot
const r = await preflight(sender, recipient, publicClient)
if (!r.safe) console.log(r.reasonCode, r.layer, r.revertReason)

// Guarded wallet — every sendTransaction is checked first
const wallet = withPreflight(createWalletClient({ /* … */ }), publicClient)
try {
  await wallet.sendTransaction({ to, value })
} catch (err) {
  if (err instanceof PreflightError) console.log(err.reasonCode, err.layer, err.revertReason)
}
```

## Ethers v6

```ts
import { JsonRpcProvider, Wallet } from 'ethers'
import { withPreflightEthers, preflightEthers, ARC_MAINNET_RPC_URL } from 'arc-preflight'

const provider = new JsonRpcProvider(ARC_MAINNET_RPC_URL)
const r = await preflightEthers(sender, recipient, provider)
const signer = withPreflightEthers(new Wallet(key, provider), provider)
```

## Result

```ts
type PreflightResult = {
  safe: boolean
  revertReason: string | null
  reasonCode?: 'BLOCKLIST' | 'ZERO_ADDRESS' | 'PRECOMPILE' | 'BURN_FORBIDDEN' | 'INSUFFICIENT_FUNDS' | 'UNKNOWN'
  layer?: 'sanctions' | 'cache' | 'isBlacklisted' | 'simulation'
  gasEstimate: bigint          // live when safe; 34_000 fallback when it would revert
  recipientsChecked?: Address[]
}
```

## More

- `preflightMany(sender, recipients, client, { concurrency })` — batch.
- `createBlocklistCache(client, { lookbackBlocks })` — backfills USDC `Blacklisted` events and watches for new ones; pass as `{ cache }`.
- `decodeTransferIntents(tx)` — the calldata decoder.
- `httpTransport(url)` — use the engine with no viem/ethers at all.
- Sanctions snapshot scope: **OFAC SDN "Digital Currency Address - ETH" only**. See `sanctionsVersion`, `sanctionsCount`, `sanctionsScope`.

Full docs, limitations and the live demo: https://github.com/tushar598/arc-preflight

MIT
