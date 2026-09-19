'use client'

import { useState } from 'react'
import { usePublicClient, useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { 
  preflight, 
  MAINNET_DEMO_BLOCKED_ADDRESS,
  MIN_BASE_FEE_WEI
} from 'arc-preflight'
import { type PublicClient, isAddress, formatEther } from 'viem'

export function PreflightDemo() {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('100')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    safe: boolean
    reason?: string | null
    gasSaved?: string
  } | null>(null)

  const handleSimulate = async () => {
    if (!publicClient || !address || !recipient) return

    setLoading(true)
    setResult(null)

    if (!isAddress(recipient)) {
      setResult({
        safe: false,
        reason: 'Invalid Ethereum address format'
      })
      setLoading(false)
      return
    }

    try {
      // Amount in Wei (dummy conversion, assuming 18 decimals and simplistic integer input for demo)
      const simulatedValue = BigInt(amount) * (BigInt(10) ** BigInt(18))

      // Run preflight check
      const check = await preflight(address, recipient as `0x${string}`, publicClient as unknown as PublicClient, {
        simulatedValue
      })

      let gasSaved: string | undefined
      if (!check.safe && check.gasEstimate) {
        const costInWei = check.gasEstimate * BigInt(MIN_BASE_FEE_WEI)
        // Format to standard decimal representation
        gasSaved = formatEther(costInWei)
      }

      setResult({
        safe: check.safe,
        reason: check.revertReason,
        gasSaved
      })
    } catch (err: unknown) {
      setResult({
        safe: false,
        reason: err instanceof Error ? err.message : String(err)
      })
    } finally {
      setLoading(false)
    }
  }

  const fillBlocked = () => setRecipient(MAINNET_DEMO_BLOCKED_ADDRESS)
  const fillSafe = () => setRecipient('0x1234567890123456789012345678901234567890') // Just a random valid hex address

  return (
    <div className="w-full max-w-2xl mx-auto space-y-8 mt-12">
      {/* Wallet Connect */}
      <div className="flex items-center justify-between p-6 bg-white rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">1. Connect Wallet</h2>
          <p className="text-slate-500 text-sm mt-1">Connect to Arc Mainnet or Testnet to simulate transfers.</p>
        </div>
        <ConnectButton />
      </div>

      {/* Simulator */}
      <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-200 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">2. Simulate Transfer</h2>
          <p className="text-slate-500 text-sm mt-1">
            Test a transfer. If the recipient is blocklisted, arc-preflight catches it before any gas is spent.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Recipient Address</label>
            <input 
              type="text"
              value={recipient}
              onChange={e => setRecipient(e.target.value)}
              placeholder="0x..."
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-slate-900 font-mono text-sm"
            />
            <div className="flex gap-2 mt-2">
              <button onClick={fillBlocked} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Autofill Blocked Address</button>
              <span className="text-slate-300">|</span>
              <button onClick={fillSafe} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Autofill Safe Address</button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Amount (ARC)</label>
            <input 
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-slate-900"
            />
          </div>

          <button
            onClick={handleSimulate}
            disabled={!address || !recipient || loading}
            className="w-full py-3 px-4 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Simulating...' : 'Run Preflight Check'}
          </button>
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className={`p-6 rounded-2xl border ${result.safe ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-start gap-4">
            <div className={`p-2 rounded-full ${result.safe ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {result.safe ? (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              ) : (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              )}
            </div>
            <div className="flex-1">
              <h3 className={`text-lg font-bold ${result.safe ? 'text-green-900' : 'text-red-900'}`}>
                {result.safe ? 'Transfer is Safe' : 'Transfer Blocked'}
              </h3>
              <p className={`mt-1 text-sm ${result.safe ? 'text-green-700' : 'text-red-700'}`}>
                {result.safe 
                  ? 'No blocklist issues detected. The transaction will succeed.' 
                  : `Arc runtime reverted: ${result.reason}`
                }
              </p>
              
              {!result.safe && result.gasSaved && (
                <div className="mt-4 p-4 bg-white bg-opacity-60 rounded-xl border border-red-100 flex items-center justify-between">
                  <span className="font-semibold text-red-900">Estimated Gas Saved</span>
                  <span className="font-mono text-red-700 font-bold">{result.gasSaved} USDC (Native)</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
