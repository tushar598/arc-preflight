# Phase 1 Plan

## Tasks
- [x] Research Arc Mainnet configurations (Chain ID, RPC, Explorer). → Chain ID: 5042, RPC: https://rpc.mainnet.arc.io
- [x] Research Arc contract addresses (`Memo`, `Multicall3From`). → Memo: 0x5294..., Multicall3From: 0x522f...
- [x] Create and populate `.env` file. → `.env.example` and `.env` created.
- [x] Set up `arc-anvil`. → Instructions documented in 1-RESEARCH.md. Requires arc-foundry.
- [x] Write prototype script to trigger and measure the runtime-transfer-check revert. → `scripts/reproduce-revert.ts` created.
- [x] Document the gas cost for the UI counter. → Gas cost formula documented in script and 1-RESEARCH.md.
