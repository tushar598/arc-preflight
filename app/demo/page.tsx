import type { Metadata } from 'next'
import { MAINNET_DEMO_BLOCKED_ADDRESS } from 'arc-preflight'
import { Landing } from '@/components/Landing'

export const metadata: Metadata = {
  title: 'arc-preflight demo',
  description: 'One-click: preflight a transfer to an OFAC-sanctioned address on Arc mainnet and watch it get blocked before any gas is spent.',
}

/**
 * /demo — deep link for judges. Pre-fills the mainnet blocked address and runs
 * the check on load so the BLOCKED verdict is the first thing on screen.
 */
export default function DemoPage() {
  return <Landing initialRecipient={MAINNET_DEMO_BLOCKED_ADDRESS} autoRun />
}
