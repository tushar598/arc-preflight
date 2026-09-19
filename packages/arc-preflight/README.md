# arc-preflight

> A zero-infrastructure preflight check that tells you if a USDC transfer on Arc will revert — before you pay gas to find out.

The `arc-preflight` SDK intercepts NATIVE USDC transfers to OFAC-sanctioned or Arc-blocklisted addresses before they hit the network, saving you gas and preventing stuck transactions.

## Features

- **Zero-infrastructure**: No database, no API keys, no backend needed.
- **Gas Saver**: Accurately simulates the transfer via `eth_call` and catches Arc's runtime transfer blocklist *before* the transaction is submitted.
- **Viem & Ethers Support**: Works seamlessly with both Viem and Ethers v6.
- **Offline Sanctions Check**: Includes an embedded, self-updating snapshot of the OFAC SDN list for zero-latency, offline screening.
- **Agent-Ready**: Easy-to-use middleware `withPreflight()` proxies your wallet client, guarding autonomous agents from sending funds to blocked addresses.

## Installation

```bash
npm install arc-preflight viem
# Or with ethers:
npm install arc-preflight ethers
```

## Quick Start (Viem)

```ts
import { createWalletClient, createPublicClient, http } from 'viem'
import { withPreflight, PreflightError } from 'arc-preflight'

const publicClient = createPublicClient({ transport: http('https://rpc.mainnet.arc.io') })
const walletClient = createWalletClient({ /* ... */ })

// Wrap your wallet with the preflight guard
const guardedWallet = withPreflight(walletClient, publicClient)

try {
  // If the recipient is blocklisted, this throws immediately without spending gas
  const hash = await guardedWallet.sendTransaction({
    to: '0xRecipientAddress',
    value: 1000000n, // amount in wei
  })
} catch (err) {
  if (err instanceof PreflightError) {
    console.error('Transfer blocked by Arc preflight:', err.revertReason)
  }
}
```

## Quick Start (Ethers v6)

```ts
import { JsonRpcProvider, Wallet } from 'ethers'
import { withPreflightEthers, PreflightError } from 'arc-preflight'

const provider = new JsonRpcProvider('https://rpc.mainnet.arc.io')
const signer = new Wallet('0xprivatekey', provider)

const guardedSigner = withPreflightEthers(signer, provider)

try {
  const tx = await guardedSigner.sendTransaction({
    to: '0xRecipientAddress',
    value: 1000000n,
  })
} catch (err) {
  if (err instanceof PreflightError) {
    console.error('Transfer blocked by Arc preflight:', err.revertReason)
  }
}
```

## License

MIT
