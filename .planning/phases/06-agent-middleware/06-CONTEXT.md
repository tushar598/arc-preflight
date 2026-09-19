# Phase 6: Agent Middleware

## Domain
This phase delivers a standalone demonstration script showing an autonomous agent distributing USDC safely to workers using the `arc-preflight` middleware.

## Canonical Refs
- `ROADMAP.md`

## Decisions
### Implementation Details
- **Library Choice:** Use `viem` (the primary SDK adapter).
- **Failure Handling:** Catch `PreflightError` to skip blocked workers and log the gas saved. Continue executing the loop for other workers to demonstrate robustness.
- **Environment:** Use a randomly generated ephemeral private key and hardcoded Arc Testnet values. No `.env` setup required by the user, ensuring the script runs frictionlessly out-of-the-box (`npm run start`).

## Deferred Ideas
- None
