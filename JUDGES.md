# For judges — 60 seconds

**Live demo (Arc mainnet, chain 5042):** `https://arc-preflight.vercel.app` — *URL finalised at deploy; the same build is reproducible with `npm ci && npm run build && npm start`.*

## Click path

1. Open **`/demo`**. The mainnet blocked address is pre-filled and the check runs on load. You see **BLOCKED · BLOCKLIST**, the OFAC layer lit, and "gas you did not spend ≈ 0.00068 USDC". No wallet, no key — it just called Arc's public RPC from your browser.
2. Press **Clean address** → **Run preflight**. All four layers turn clear; the gas figure is now a live `eth_estimateGas` (21,000).
3. Press **Zero address** → **Run preflight**. Layers 1–3 clear; layer 4 (the `eth_call` simulation) catches it: **ZERO_ADDRESS · "Zero address not allowed"**. This is the case `isBlacklisted()` alone can never see.
4. Optional, with a wallet on **Arc Testnet**: scroll to *Then try it against the real chain*. **Send with preflight** stops before broadcast. **Send anyway** broadcasts, and the explorer shows the transaction included, reverted, gas consumed. That delta is the product.

## Addresses used

| Network | Address | Why it is blocked |
|---------|---------|-------------------|
| Mainnet | `0xd882cFc20F52f2599D84b8e8D58C7FB62cfE344b` | OFAC SDN (Lazarus Group mixer); on Arc's runtime blocklist. Do not send funds. |
| Testnet | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | Seeded by Arc (mnemonic index 1) for exactly this kind of test |

## What is Arc-native here

- Native USDC as gas, 18-decimal native path vs 6-decimal ERC-20 interface — the probe uses the native path on purpose.
- Arc's runtime transfer check, hit via `eth_call` + `stateOverride`, so no funded account is needed.
- `USDC.isBlacklisted()` on the predeploy at `0x3600…0000`, the check Arc's exchange guide prescribes.
- `Memo` and `Multicall3From` calldata unwrapped and attributed to the original sender through the CallFrom precompile, so a batch payroll with one bad recipient is stopped whole.
- Public mainnet RPC only. Zero backend.

## Worth taking further

- **Wallets:** a pre-send warning for any Arc wallet — the `withPreflight` proxy is the integration.
- **Exchanges / on-ramps:** withdrawal screening that also catches zero-address and precompile mistakes, not just the blocklist.
- **Agents:** `preflightMany` + the guarded client keep payout loops from paying for reverts; `examples/agent/run.ts` shows it.
- **Circle Grant Program path:** an `@arc/preflight`-style official helper, a Blockscout plugin that shows "would revert" before signing, and a hosted `eth_getLogs` backfill so the local cache starts warm.

## Run locally

```bash
npm ci && npm run sdk:test      # 67 offline tests
npm run dev                      # http://localhost:3000  (/demo)
npx arc-preflight 0xd882cFc20F52f2599D84b8e8D58C7FB62cfE344b   # after `npm run sdk:build`: node packages/arc-preflight/dist/bin.js …
```
