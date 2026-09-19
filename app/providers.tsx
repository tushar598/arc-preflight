'use client'

import { useState } from 'react'
import {
  RainbowKitProvider,
  getDefaultConfig,
  lightTheme,
} from '@rainbow-me/rainbowkit'
import '@rainbow-me/rainbowkit/styles.css'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type Chain } from 'viem'
import {
  ARC_MAINNET_CHAIN_ID,
  ARC_MAINNET_RPC_URL,
  ARC_MAINNET_EXPLORER_URL,
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_RPC_URL,
  ARC_TESTNET_EXPLORER_URL,
} from 'arc-preflight'

// Define the Arc Mainnet chain
const arc: Chain = {
  id: ARC_MAINNET_CHAIN_ID,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: [ARC_MAINNET_RPC_URL] },
  },
  blockExplorers: {
    default: { name: 'Arc Explorer', url: ARC_MAINNET_EXPLORER_URL },
  },
}

// Define the Arc Testnet chain
const arcTestnet: Chain = {
  id: ARC_TESTNET_CHAIN_ID,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: [ARC_TESTNET_RPC_URL] },
  },
  blockExplorers: {
    default: { name: 'Arc Testnet Explorer', url: ARC_TESTNET_EXPLORER_URL },
  },
  testnet: true,
}

const config = getDefaultConfig({
  appName: 'Arc Preflight Demo',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_ID || 'arc-preflight-demo',
  chains: [arc, arcTestnet],
  ssr: true,
})

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: 60 * 1000 } },
  })
}

let browserQueryClient: QueryClient | undefined

export function Providers({ children }: { children: React.ReactNode }) {
  // Avoid shared singleton across SSR requests
  const [queryClient] = useState(() => {
    if (typeof window === 'undefined') return makeQueryClient()
    if (!browserQueryClient) browserQueryClient = makeQueryClient()
    return browserQueryClient
  })

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={lightTheme({
            accentColor: '#0f172a',
            accentColorForeground: 'white',
            borderRadius: 'medium',
            fontStack: 'system',
            overlayBlur: 'small',
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
