# Arc Preflight

> **Stop paying gas for blocklisted transfers on Arc.**

A zero-infrastructure SDK and interactive demo for the Arc Network. Built for the **Arc Microgrants (Circle × DoraHacks)**.

## What is this?

Arc enforces a **runtime transfer blocklist** directly in the EVM. If you send USDC to an OFAC-sanctioned address (or an address blocked by Arc for malicious activity), the transaction reverts. You lose the gas fee, and autonomous agents get stuck in retry loops.

`arc-preflight` solves this. It's a lightweight NPM package that simulates native USDC transfers via `eth_call` (with `stateOverride`) *before* submission. If the transfer hits the blocklist, the simulation reverts, catching the error **for free**.

- **Zero-infrastructure**: No databases, no API keys.
- **Offline Sanctions Check**: Includes a bundled OFAC SDN list, updated automatically via GitHub Actions.
- **Developer Friendly**: Drop-in middleware for Viem and Ethers v6.

## Structure

This repository is a monorepo containing:

1. **`packages/arc-preflight/`**: The core SDK. Published to npm as `arc-preflight`. (See its [README](packages/arc-preflight/README.md) for usage).
2. **`app/`**: A Next.js (App Router) demo application that integrates the SDK to showcase gas savings visually.

## Running the Demo Locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000). Connect a wallet (Arc Mainnet or Testnet) and try simulating a transfer to the provided blocklisted test addresses.

## SDK Usage (Viem)

```ts
import { createWalletClient, createPublicClient, http } from 'viem'
import { withPreflight, PreflightError } from 'arc-preflight'

const publicClient = createPublicClient({ transport: http('https://rpc.mainnet.arc.io') })
const walletClient = createWalletClient({ /* ... */ })

// Wrap your wallet with the preflight guard
const guardedWallet = withPreflight(walletClient, publicClient)

try {
  // Throws BEFORE gas is spent if the recipient is blocklisted
  const hash = await guardedWallet.sendTransaction({
    to: '0xRecipientAddress',
    value: 1000000n, // amount in wei
  })
} catch (err) {
  if (err instanceof PreflightError) {
    console.error('Transfer blocked:', err.revertReason)
  }
}
```

## License

MIT
