# Data Sources

`arc-preflight` uses two independent mechanisms to detect blocklisted addresses:

## 1. Arc Runtime Probe (Primary)

The primary mechanism is a live `eth_call` against Arc's on-chain runtime. This queries the exact same blocklist check that a real `transfer()` would hit — there is zero divergence between the simulation and a real transaction.

- **Source:** Arc Network's native runtime transfer-check rule
- **Latency:** ~50–200ms (single RPC round-trip)
- **Freshness:** Real-time — always reflects the current on-chain state
- **Coverage:** All addresses blocklisted by Arc's runtime, including OFAC, EU, UN, and any Arc-specific additions

## 2. Embedded Sanctions Snapshot (Baseline)

A versioned JSON file (`data/sanctions.json`) ships with the package. It provides a fast, offline-capable baseline check before the on-chain probe.

### Sources

| List | Authority | Update Frequency | URL |
|------|-----------|-----------------|-----|
| SDN List | OFAC (U.S. Treasury) | Daily | https://sanctionslist.ofac.treas.gov |
| EU Financial Sanctions | European Commission | Weekly | https://data.europa.eu/data/datasets |
| UN Security Council | United Nations | As published | https://scsanctions.un.org |

### Update Mechanism

A scheduled GitHub Action (`sync-sanctions.yml`) runs daily at 00:00 UTC:

1. Fetches the latest lists from each source
2. Extracts Ethereum addresses (where available)
3. Deduplicates and merges into `data/sanctions.json`
4. Opens a PR if any addresses changed

### File Format

```json
{
  "version": "2026-09-19",
  "sources": ["ofac", "eu", "un"],
  "addresses": [
    "0x...",
    "0x..."
  ]
}
```

All addresses are lowercased and checksummed. The `version` field is the date of the last sync.

## Which Check Runs When?

- `preflight()` — Runs the on-chain probe. Does **not** consult the embedded snapshot.
- `checkSanctions()` — Checks only the embedded snapshot. No RPC call.
- `withPreflight()` — Runs the on-chain probe on every `sendTransaction`.

For maximum coverage, use both: check the snapshot first (instant), then confirm with the probe (authoritative).
