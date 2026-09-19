'use client'

import { useState } from 'react'
import { usePublicClient, useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { 
  preflight, 
  MAINNET_DEMO_BLOCKED_ADDRESS,
  MIN_BASE_FEE_WEI,
  USDC_TRANSFER_GAS_ESTIMATE
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

  const isValidAddress = recipient === '' ? null : isAddress(recipient)

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
      const simulatedValue = BigInt(amount) * (BigInt(10) ** BigInt(18))
      const check = await preflight(address, recipient as `0x${string}`, publicClient as unknown as PublicClient, {
        simulatedValue
      })

      let gasSaved: string | undefined
      if (!check.safe && check.gasEstimate) {
        const costInWei = check.gasEstimate * BigInt(MIN_BASE_FEE_WEI)
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
  const fillSafe = () => setRecipient('0x1234567890123456789012345678901234567890')

  // Determine input border style
  const getInputBorderStyle = () => {
    if (isValidAddress === null) return {} // neutral
    if (isValidAddress) return { borderColor: 'rgba(34, 197, 94, 0.4)', boxShadow: '0 0 0 3px rgba(34, 197, 94, 0.1)' }
    return { borderColor: 'rgba(239, 68, 68, 0.4)', boxShadow: '0 0 0 3px rgba(239, 68, 68, 0.1)' }
  }

  return (
    <div className="w-full max-w-xl mx-auto">
      <div className="card card-glow p-8 space-y-8">
        {/* Connect Wallet */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono font-bold" style={{ color: '#6366F1' }}>01</span>
              <h2 className="text-sm font-semibold" style={{ color: '#F1F5F9' }}>Connect Wallet</h2>
            </div>
            <p className="text-xs" style={{ color: '#64748B' }}>Connect to Arc Mainnet or Testnet</p>
          </div>
          <ConnectButton />
        </div>

        {/* Divider */}
        <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)' }} />

        {/* Simulate Transfer */}
        <div className="space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono font-bold" style={{ color: '#6366F1' }}>02</span>
              <h2 className="text-sm font-semibold" style={{ color: '#F1F5F9' }}>Simulate Transfer</h2>
            </div>
            <p className="text-xs" style={{ color: '#64748B' }}>
              Enter a recipient address. Blocklisted transfers are caught before gas is spent.
            </p>
          </div>

          {/* Recipient Input */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: '#94A3B8' }}>Recipient Address</label>
            <input 
              type="text"
              value={recipient}
              onChange={e => setRecipient(e.target.value)}
              placeholder="0x..."
              className="input-field w-full px-4 py-3 text-sm"
              style={getInputBorderStyle()}
            />
            <div className="flex items-center gap-3 mt-2">
              <button onClick={fillBlocked} className="text-xs font-medium transition-colors" style={{ color: '#EF4444' }}>
                ⚠ Use blocked address
              </button>
              <span style={{ color: 'rgba(255,255,255,0.1)' }}>·</span>
              <button onClick={fillSafe} className="text-xs font-medium transition-colors" style={{ color: '#22C55E' }}>
                ✓ Use safe address
              </button>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: '#94A3B8' }}>Amount (USDC)</label>
            <input 
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="input-field w-full px-4 py-3 text-sm"
            />
          </div>

          {/* Submit */}
          <button
            onClick={handleSimulate}
            disabled={!address || !recipient || loading}
            className="btn-primary w-full py-3.5 px-4 text-sm"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Simulating...
              </span>
            ) : 'Run Preflight Check'}
          </button>
        </div>

        {/* ─── Result ─── */}
        {result && (
          <div className="animate-slide-in">
            <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', marginBottom: '24px' }} />
            
            <div className="rounded-xl p-5" style={{ 
              background: result.safe ? 'rgba(34, 197, 94, 0.06)' : 'rgba(239, 68, 68, 0.06)',
              border: `1px solid ${result.safe ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)'}`,
            }}>
              <div className="flex items-start gap-4">
                {/* Badge */}
                <div className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide ${result.safe ? 'badge-safe' : 'badge-blocked'}`}>
                  {result.safe ? 'SAFE' : 'BLOCKED'}
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold" style={{ color: result.safe ? '#22C55E' : '#EF4444' }}>
                    {result.safe ? 'Transfer will succeed' : 'Transfer would revert'}
                  </h3>
                  <p className="text-xs mt-1 break-all" style={{ color: result.safe ? 'rgba(34,197,94,0.7)' : 'rgba(239,68,68,0.7)' }}>
                    {result.safe 
                      ? 'No blocklist issues detected. Transaction can proceed safely.' 
                      : result.reason
                    }
                  </p>
                </div>
              </div>

              {/* Gas Saved Callout */}
              {!result.safe && result.gasSaved && (
                <div className="mt-4 rounded-lg p-4 flex items-center justify-between" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(239,68,68,0.1)' }}>
                  <span className="text-xs font-medium" style={{ color: '#94A3B8' }}>Estimated gas saved</span>
                  <span className="font-mono text-sm font-bold" style={{ color: '#EF4444' }}>{result.gasSaved} USDC</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
