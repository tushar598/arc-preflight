import type { Metadata } from 'next'
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'
import { Providers } from './providers'
import './globals.css'

const plexSans = IBM_Plex_Sans({
  variable: '--font-plex-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
})

const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
})

export const metadata: Metadata = {
  title: 'arc-preflight',
  description:
    'Know whether a USDC transfer will revert on Arc before you pay gas for it. Simulates Arc’s protocol blocklist and native transfer rules with one eth_call. No backend.',
  keywords: ['arc', 'circle', 'usdc', 'preflight', 'blocklist', 'ofac', 'viem', 'ethers'],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
