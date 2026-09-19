'use client'

import { useState } from 'react'
import { RainbowKitProvider, getDefaultConfig, darkTheme } from '@rainbow-me/rainbowkit'
import '@rainbow-me/rainbowkit/styles.css'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { arcMainnet, arcTestnet } from '@/lib/chains'

const config = getDefaultConfig({
  appName: 'arc-preflight',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_ID || 'arc-preflight-demo',
  chains: [arcMainnet, arcTestnet],
  ssr: true,
})

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { staleTime: 60 * 1000 } } })
}

let browserQueryClient: QueryClient | undefined

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => {
    if (typeof window === 'undefined') return makeQueryClient()
    if (!browserQueryClient) browserQueryClient = makeQueryClient()
    return browserQueryClient
  })

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#7c7aff',
            accentColorForeground: '#0b0c17',
            borderRadius: 'small',
            fontStack: 'system',
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
