# Phase 6: Agent Middleware - Plan

## Goal
Implement a standalone demonstration script at `examples/agent/run.ts` showing an autonomous agent distributing USDC safely using the `arc-preflight` middleware.

## Context
- **Decisions**: Use `viem` adapter. Catch `PreflightError` to skip blocked workers and continue. Use ephemeral testnet keys (zero setup required by user).
- **Research**: The middleware is already built. We just need the example package and script.

## Tasks

### 1. `examples/agent/package.json`
- Create a minimal `package.json` in `packages/arc-preflight/examples/agent`.
- **Dependencies**: `viem`, `arc-preflight` (workspace reference or relative file).
- **DevDependencies**: `tsx` (for running the TypeScript file).
- **Scripts**: `"start": "tsx run.ts"`.

### 2. `examples/agent/run.ts`
- Implement the agent payout script using `viem`.
- Generate a random private key for the mock agent.
- Connect to Arc Testnet using `http(ARC_TESTNET_RPC_URL)`.
- Wrap the wallet client with `withPreflight`.
- Loop over a list of workers (1 clean, 1 blocked).
- Attempt to `sendTransaction`.
- Catch `PreflightError`, log the gas saved, and continue the loop.

### 3. Verification
- Run `npm install` and `npm start` in the `examples/agent` directory.
- Ensure the terminal output clearly shows the blocked transaction being intercepted and the safe transaction proceeding.

## Definition of Done
- The `examples/agent/run.ts` script runs cleanly out-of-the-box and demonstrates the preflight block and loop continuation.
