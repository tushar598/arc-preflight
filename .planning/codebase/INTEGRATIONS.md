# Integrations

## Internal Systems
- **`arc-preflight` SDK**: The core local integration, providing runtime blocklist validation and OFAC sanctions checks before transactions are sent. Provides the `withPreflight` wrapper and core simulation logic.

## Third-Party Web3 Services
- **RainbowKit & Wagmi**: Used for wallet connection and state management. The app wraps the standard `walletClient` with `withPreflight` to intercept sends.
- **Viem**: Low-level Ethereum interactions, used for `eth_call` simulations and block retrieval.
- **Arc Network (Testnet/Mainnet)**: Integrates with Arc's RPC (`rpc.testnet.arc.network`) to simulate transfers against the actual chain state.

## External Data / Scripts
- **OFAC Sanctions List**: An embedded list of addresses (`sanctionsVersion`). Synced via `scripts/sync-lists.ts`.

## UI Libraries
- **GSAP & Lenis**: Integrated into `Landing.tsx` for scroll-triggered reveal animations and smooth page scrolling.
- **Lucide React**: Vector icons used throughout the UI.
