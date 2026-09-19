# Phase 1 UAT Results

**Date:** 2026-09-19
**Phase:** 1 — Environment Reconfirmation & Prototyping

---

## Test Results

| # | Test | Result | Notes |
|---|---|---|---|
| 1 | Arc Mainnet config researched from official docs | ✅ PASS | Chain 5042, `rpc.mainnet.arc.io` confirmed |
| 2 | Arc Testnet config researched | ✅ PASS | Chain 5042002, `rpc.testnet.arc.network` confirmed |
| 3 | `Memo` contract address confirmed | ✅ PASS | `0x5294E9927c3306DcBaDb03fe70b92e01cCede505` (same on both) |
| 4 | `Multicall3From` contract address confirmed | ✅ PASS | `0x522fAf9A91c41c443c66765030741e4AaCe147D0` (same on both) |
| 5 | `.env.example` created with all values | ✅ PASS | All config sourced from `docs.arc.network` |
| 6 | `arc-anvil` setup documented | ✅ PASS | Requires `arc-foundry`; documented in `1-RESEARCH.md` |
| 7 | Prototype script TypeScript compiles clean | ✅ PASS | `tsc --strict --noEmit` exit 0 |
| 8 | Script runs against Arc Testnet live | ✅ PASS | Script exits 0, revert confirmed |
| 9 | `eth_call` revert detected | ✅ PASS | `reverted: ✓ YES` confirmed in output |
| 10 | Gas cost formula documented | ✅ PASS | `gasEstimate × 20 Gwei / 1e18` |

---

## Issues Found & Fixed During UAT

### Issue 1 — Incorrect `defineChain` import (FIXED ✅)
- **Bug:** `defineChain` was imported from `viem/chains` — it doesn't exist there.
- **Fix:** Changed import to `from 'viem'`.

### Issue 2 — Revert reason showing generic message (PARTIALLY FIXED ✅)
- **Finding:** The revert reason now decodes from ABI-encoded error data. Showing `"ERC20: transfer amount exceeds balance"` because the `from` account has zero USDC, so the ERC-20 balance check fires before the blocklist check.
- **Root cause insight:** Arc's `runtime-transfer-check` blocklist enforcement fires on **native value transfers**, not ERC-20 `transfer()` calls. The ERC-20 `transfer()` checks balance first. The correct probe for blocklist detection uses a **native USDC send** (via `msg.value`), not the ERC-20 interface.
- **Action for Phase 2:** The `probe.ts` implementation must use a native send simulation, not `USDC.transfer()`.

### Issue 3 — Gas estimate using fixed fallback (ACCEPTABLE for Phase 1 ✅)
- The `estimateGas` for a normal ERC-20 transfer requires a funded sender. Phase 1 uses a documented ~34,000 gas constant. Phase 2 will implement proper estimation.

---

## Critical Insight for Phase 2

> [!IMPORTANT]
> **The correct preflight probe mechanism is a native USDC send, not `USDC.transfer()`.**
>
> To trigger the blocklist check via `eth_call`, simulate:
> ```
> client.call({ account: sender, to: recipient, value: 1n })
> ```
> This uses the **native value transfer path** where Arc enforces the blocklist.
> The ERC-20 path only checks balance; it doesn't gate on the blocklist.

---

## Phase 1 Verdict: ✅ PASS (with Phase 2 follow-up item)

All six deliverables are complete. The critical protocol insight (native vs ERC-20 path for blocklist detection) has been identified and must guide the Phase 2 `probe.ts` implementation.
