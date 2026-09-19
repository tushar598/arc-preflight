# Phase 1 Context: Environment Reconfirmation & Prototyping

## Decisions
- **Mainnet Configuration**: The mainnet Chain ID, RPC URL, and Explorer URL are currently unverified. The agent is responsible for researching and extracting these values from the official Arc documentation during the execution phase.
- **Contract Addresses**: The `Memo` and `Multicall3From` contract addresses must be researched and extracted from the official Arc documentation during the execution phase.

## Scope for Next Phase (Phase 1)
- Reconfirm all values mentioned above.
- Create and populate the `.env` file with these values.
- Set up `arc-anvil` and reproduce the runtime-transfer-check revert.
- Document the exact gas cost of a reverted transfer for the gas-saved counter.
