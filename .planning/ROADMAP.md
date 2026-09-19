# Roadmap: arc-preflight

## Phase 1: Environment Reconfirmation & Prototyping
- **Goal:** Reconfirm mainnet values, testnet values, and reproduce the revert on `arc-anvil`.
- **Output:** Filled-in `.env`, a recorded failing transaction hash + gas-cost number.

## Phase 2: Core SDK - Probe & Viem Adapter
- **Goal:** Implement `probe.ts` (`eth_call` check) and Viem adapter.
- **Output:** Working `preflight()` function with passing unit tests against `arc-anvil`.

## Phase 3: Sanctions Data Ingestion
- **Goal:** Implement `scripts/sync-lists.ts` and GitHub Action for scheduled updates.
- **Output:** Self-updating package data (`data/sanctions.json`).

## Phase 4: Local Blocklist Cache
- **Goal:** Implement optional event-subscription cache (`blocklistCache.ts`).
- **Output:** Cache correctly tracking `Blocklisted`/`UnBlocklisted` events.

## Phase 5: Demo Page Deployment
- **Goal:** Build and deploy static demo page to Arc mainnet.
- **Output:** Live deployable link with gas-saved counter and testnet revert demo.

## Phase 6: Agent Middleware
- **Goal:** Implement `withPreflight` middleware and `examples/agent/run.ts`.
- **Output:** Agentic-economy demonstration script.

## Phase 7: Final Polish & Publication
- **Goal:** Ethers adapter, docs (`data-sources.md`, `limitations.md`), and `npm publish`.
- **Output:** Public repository and published npm package.
