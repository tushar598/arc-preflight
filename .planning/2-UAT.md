# Phase 2 UAT Results

**Date:** 2026-09-19
**Phase:** 2 — Core SDK (Probe & Viem Adapter)

---

## Test Results

| # | Test Description | Result | Notes |
|---|------------------|--------|-------|
| 1 | `preflight` on clean recipient (0x1111…1111) returns safe | ✅ PASS | `safe: true`, `revertReason: null`, `gasEstimate: 34000n` |
| 2 | `preflight` on blocklisted recipient (0x7099…79C8) returns unsafe | ✅ PASS | `safe: false`, `revertReason: "Blocked address"`, `gasEstimate: 34000n` |
| 3 | `withPreflight` proxy blocks transfer to blocklisted address | ✅ PASS | `PreflightError` thrown with revert reason `Blocked address` |
| 4 | `withPreflight` proxy allows transfer to clean recipient | ✅ PASS | Mock wallet client returned hash `0xmockhash` |

---

## Summary
All functional verification checks for Phase 2 passed. The SDK correctly detects blocklisted addresses via native‑value simulation and the `withPreflight` wrapper guards transactions as expected.

**Next steps:** Proceed to Phase 3 – integration tests against `arc-anvil` and Vitest suite.
