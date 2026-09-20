# Architecture

## High-Level Pattern
The application uses a **Client-Side Heavy, Zero-Backend** architecture. All logic is executed in the browser via direct RPC calls to the blockchain.

## Key Layers
1. **Presentation Layer (Next.js App Router)**:
   - Contains a single main landing page (`app/page.tsx` -> `Landing.tsx`) and a demo route (`app/demo/page.tsx`).
   - Uses extensive client-side JavaScript (`use client`) for animations, wallet state, and tool interactivity.

2. **Simulation & Validation Layer (`Preflight.tsx` & `arc-preflight` SDK)**:
   - Performs a 4-step validation before allowing a transfer:
     1. Local offline OFAC SDN check.
     2. Blocklist event cache check (`eth_getLogs`).
     3. `USDC.isBlacklisted()` view call.
     4. Ground-truth `eth_call` simulation via state overrides.

3. **Execution Layer (`WalletSend.tsx`)**:
   - Uses Wagmi hooks to connect to the Arc testnet.
   - Demonstrates wrapping the wallet client with `withPreflight` so that a user cannot accidentally broadcast a transaction that would revert.

## State Management
- Wagmi handles global blockchain state (wallet connection, network, balances).
- Local React component state (`useState`, `useRef`) handles UI interactions (form inputs, animations, simulation results).
