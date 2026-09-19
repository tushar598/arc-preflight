# Phase 6: Agent Middleware - Research

## Context & Objectives
- **Goal**: Implement `examples/agent/run.ts` to showcase how an autonomous agent uses `arc-preflight` to safely navigate blocklisted addresses without burning gas.
- **Middleware**: `withPreflight` (Viem) and `withPreflightEthers` (Ethers) have already been implemented in Phase 2. 

## Technical Approach
1. **Script Architecture**: A simple Node.js CLI script (`run.ts`) using `viem` to simulate an autonomous agent processing a batch of payouts.
2. **Key Logic**: 
   - A list of recipient addresses (mixing safe addresses and known blocklisted addresses).
   - A loop iterating over the addresses, initiating a transfer via a wallet client wrapped with `withPreflight`.
   - A `try/catch` block that traps the `PreflightError`, logs the skipped transaction (and the gas saved), and gracefully continues the loop to pay the next worker.
3. **Execution Context**: The script will live in `packages/arc-preflight/examples/agent`. It will require a tiny `package.json` with `tsx` (or similar) to execute the TypeScript file directly, relying on the local SDK.

## Risk Assessment
- **Risk**: Agents getting stuck on a reverted transaction.
- **Mitigation**: The core value proposition of the SDK is preventing this. The script will explicitly demonstrate this mitigation by continuing its loop after a `PreflightError`.
