# Data sources

`arc-preflight` answers "will this transfer revert?" from four sources, cheapest first. Only the first one is data that ships in the package; the rest are read live from the chain.

## 1. Embedded OFAC SDN snapshot (`data/sanctions.json`)

| | |
|---|---|
| Authority | US Treasury, Office of Foreign Assets Control |
| List | Specially Designated Nationals (SDN) |
| Entries used | `Digital Currency Address - ETH` identifiers only |
| Feed | `https://sanctionslistservice.ofac.treas.gov/api/publicationpreview/exports/sdn.xml` |
| Refresh | Weekly, Monday 06:00 UTC, by `.github/workflows/sync-sanctions.yml` (also on PR merge and manual dispatch) |
| Script | `scripts/sync-lists.ts` |
| Snapshot in this build | see `sanctionsVersion` (the OFAC publish date, `YYYY-MM-DD`) and `sanctionsCount` |

**Scope: OFAC SDN only.** EU consolidated and UN Security Council lists are **not** included. They publish few or no crypto addresses in machine-readable form, and Arc's own runtime blocklist already covers what the protocol enforces. Do not present `checkSanctions()` as an EU/UN screen.

File format:

```json
{
  "version": "2026-09-18",
  "source": "OFAC SDN (Specially Designated Nationals List)",
  "scope": "OFAC SDN Digital Currency Address - ETH only",
  "description": "…",
  "count": 120,
  "addresses": ["0x…", "…"]
}
```

Addresses are lowercased. The sync aborts (leaving the file untouched) if it extracts zero addresses, and warns if the mainnet demo address disappears from the list.

## 2. USDC `Blacklisted` / `UnBlacklisted` events (optional local cache)

Emitted by the USDC predeploy `0x3600000000000000000000000000000000000000`. `createBlocklistCache()` backfills them with `eth_getLogs` in 2,000-block chunks (Arc's public RPC rejects larger ranges), then subscribes for new ones. Without backfill the cache starts empty.

## 3. `USDC.isBlacklisted(address)`

FiatTokenV2 view on the same predeploy, selector `0xfe575a87`. Verified on Arc mainnet and testnet. This is the check Arc's exchange integration guide recommends before withdrawals. If the call fails the layer is skipped, never fatal.

## 4. Arc runtime, via `eth_call`

The authoritative source. A native USDC send is simulated from the sender to the recipient with a `stateOverride` that grants the sender 1,000,000 USDC, so the probe reaches the runtime transfer check regardless of real balance. The revert message is Arc's own (`Blocked address`, `Zero address not allowed`, …). Reference: [Arc EVM differences → value transfer rules](https://docs.arc.io/arc/references/evm-differences).

Related Arc addresses the SDK knows about:

| Name | Address |
|------|---------|
| USDC (native / ERC-20 interface) | `0x3600000000000000000000000000000000000000` |
| Memo | `0x5294E9927c3306DcBaDb03fe70b92e01cCede505` |
| Multicall3From | `0x522fAf9A91c41c443c66765030741e4AaCe147D0` |
| System emitter (native `Transfer` logs, EIP-7708) | `0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE` |
| Native coin authority precompile | `0x1800000000000000000000000000000000000000` |
| Native coin control precompile | `0x1800000000000000000000000000000000000001` |
| CallFrom precompile | `0x1800000000000000000000000000000000000003` |
| Testnet seeded blocklisted address | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |
| Mainnet demo blocked address (OFAC, Lazarus mixer) | `0xd882cFc20F52f2599D84b8e8D58C7FB62cfE344b` |
