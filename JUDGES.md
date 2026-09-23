# For judges — 60 seconds

**Live demo (Arc mainnet, chain 5042):** `https://arc-preflight.vercel.app` — *URL finalised at deploy; the same build is reproducible with `npm ci && npm run build && npm start`.*

## Click path

1. Open **`/demo`**. The mainnet blocked address is pre-filled and the check runs on load. You see **BLOCKED · BLOCKLIST**, the OFAC layer lit, and "gas you did not spend ≈ 0.00068 USDC". No wallet, no key — it just called Arc's public RPC from your browser.
2. Press **Clean address** → **Run preflight**. All four layers turn clear; the gas figure is now a live `eth_estimateGas` (21,000).
3. Press **Zero address** → **Run preflight**. Layers 1–3 clear; layer 4 (the `eth_call` simulation) catches it: **ZERO_ADDRESS · "Zero address not allowed"**. This is the case `isBlacklisted()` alone can never see.
4. Optional, with a wallet on **Arc Testnet**: scroll to *Then try it against the real chain*. **Send with preflight** stops before broadcast. **Send anyway** broadcasts, and the explorer shows the transaction included, reverted, gas consumed. That delta is the product.
5. Scroll to **Pay many, skip the bad ones**. The payee list mixes clean addresses with the testnet blocklisted address and `0x0`. Press **Preview**, no wallet needed: each row says *pay* or *skip*, with the layer that caught it. With a testnet wallet, press **Pay 4 payees**. That sends one `payMany` transaction to our **PreflightPayout** contract. It succeeds, the clean payees are paid, the blocked ones are refunded with a `Skipped` event, and the on-chain counter goes up. A plain multicall would have reverted the whole batch.

## Addresses used

| Network | Address | Why it is blocked |
|---------|---------|-------------------|
| Mainnet | `0xd882cFc20F52f2599D84b8e8D58C7FB62cfE344b` | OFAC SDN (Lazarus Group mixer); on Arc's runtime blocklist. Do not send funds. |
| Testnet | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | Seeded by Arc (mnemonic index 1) for exactly this kind of test |

| Contract | Address (mainnet and testnet) | Source |
|----------|-------------------------------|--------|
| PreflightPayout | `0xDcCa5d6603Eb63241763665DB4c95f8c8d51BcDA` | [`contracts/src/PreflightPayout.sol`](contracts/src/PreflightPayout.sol): CREATE2, no owner, 12 Foundry tests |

On Arc Testnet: [deploy tx](https://explorer.testnet.arc.io/tx/0xd6c4d2d31bd3a311a6dcf3832b8bed79b2b53d375ab52a61fcff47134a899099) · [first batch](https://explorer.testnet.arc.io/tx/0xd48cd3c89186fc31f6c2bf17d81327575263d0502d6393c887037a3839cd51e1). The first batch had 4 payees: 2 clean ones were paid; the seeded blocklisted address and `0x0` were refunded with `Skipped` events. The transaction succeeded and used 138,446 gas.

## What is Arc-native here

- Native USDC as gas, 18-decimal native path vs 6-decimal ERC-20 interface — the probe uses the native path on purpose.
- Arc's runtime transfer check, hit via `eth_call` + `stateOverride`, so no funded account is needed.
- `USDC.isBlacklisted()` on the predeploy at `0x3600…0000`, the check Arc's exchange guide prescribes.
- `Memo` and `Multicall3From` calldata unwrapped and attributed to the original sender through the CallFrom precompile, so a batch payroll with one bad recipient is stopped whole.
- **PreflightPayout**, our own contract. It relies on an Arc behaviour we verified on both networks: inside a contract, the runtime blocklist fails only the inner `CALL` and returns its reason, so a batch can skip and refund a blocked payee instead of reverting. It also refuses `0x01–0x11`, where Arc *accepts* value and the USDC is lost.
- Public mainnet RPC only. Zero backend.

## Worth taking further

- **Wallets:** a pre-send warning for any Arc wallet — the `withPreflight` proxy is the integration.
- **Exchanges / on-ramps:** withdrawal screening that also catches zero-address and precompile mistakes, not just the blocklist.
- **Agents:** `preflightMany` + the guarded client keep payout loops from paying for reverts; `examples/agent/run.ts` shows it.
- **Circle Grant Program path:** an `@arc/preflight`-style official helper, a Blockscout plugin that shows "would revert" before signing, and a hosted `eth_getLogs` backfill so the local cache starts warm.

## Run locally

```bash
npm ci && npm run sdk:test      # 79 offline tests
npm run contracts:test          # 12 Foundry tests for PreflightPayout
npm run dev                      # http://localhost:3000  (/demo)
npx arc-preflight 0xd882cFc20F52f2599D84b8e8D58C7FB62cfE344b   # after `npm run sdk:build`: node packages/arc-preflight/dist/bin.js …
```
