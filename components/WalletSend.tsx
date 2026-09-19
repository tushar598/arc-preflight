'use client'

import { useState } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi'
import { isAddress, formatEther, parseEther, type Address, type Hash, type PublicClient, type WalletClient } from 'viem'
import {
  withPreflight,
  PreflightError,
  TESTNET_BLOCKLISTED_ADDRESS,
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_EXPLORER_URL,
} from 'arc-preflight'

const AMOUNT = parseEther('0.001')

type Outcome =
  | { kind: 'stopped'; reason: string; code: string; layer?: string }
  | { kind: 'sent'; hash: Hash; status?: 'success' | 'reverted' | 'pending'; gasUsed?: bigint; effectiveGasPrice?: bigint }
  | { kind: 'error'; message: string }

export function WalletSend() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain, isPending: switching } = useSwitchChain()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient({ chainId: ARC_TESTNET_CHAIN_ID })
  const [recipient, setRecipient] = useState<string>(TESTNET_BLOCKLISTED_ADDRESS)
  const [busy, setBusy] = useState<'guarded' | 'raw' | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  const onTestnet = chainId === ARC_TESTNET_CHAIN_ID
  const valid = isAddress(recipient)

  async function sendGuarded() {
    if (!walletClient || !publicClient || !valid) return
    setBusy('guarded')
    setOutcome(null)
    try {
      const guarded = withPreflight(walletClient as unknown as WalletClient, publicClient as unknown as PublicClient)
      const hash = await guarded.sendTransaction({
        to: recipient as Address,
        value: AMOUNT,
        account: walletClient.account,
        chain: walletClient.chain,
      })
      setOutcome({ kind: 'sent', hash, status: 'pending' })
      await track(hash)
    } catch (err) {
      if (err instanceof PreflightError) {
        setOutcome({ kind: 'stopped', reason: err.revertReason, code: err.reasonCode, layer: err.layer })
      } else {
        setOutcome({ kind: 'error', message: firstLine(err) })
      }
    } finally {
      setBusy(null)
    }
  }

  async function sendRaw() {
    if (!walletClient || !valid || !onTestnet) return
    if (!window.confirm('This skips preflight and broadcasts a real testnet transaction. It will be included, revert, and consume gas. Continue?')) return
    setBusy('raw')
    setOutcome(null)
    try {
      const hash = await walletClient.sendTransaction({
        to: recipient as Address,
        value: AMOUNT,
        account: walletClient.account,
        chain: walletClient.chain,
      })
      setOutcome({ kind: 'sent', hash, status: 'pending' })
      await track(hash)
    } catch (err) {
      setOutcome({ kind: 'error', message: firstLine(err) })
    } finally {
      setBusy(null)
    }
  }

  async function track(hash: Hash) {
    if (!publicClient) return
    try {
      const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 45_000 })
      setOutcome({ kind: 'sent', hash, status: receipt.status, gasUsed: receipt.gasUsed, effectiveGasPrice: receipt.effectiveGasPrice })
    } catch {
      setOutcome({ kind: 'sent', hash, status: 'pending' })
    }
  }

  return (
    <div className="wallet">
      <div className="wallet-row">
        <div>
          <b style={{ fontWeight: 500 }}>Send with a real wallet</b>
          <div className="note">Testnet only. Watch the guard stop a transfer, then bypass it and watch the chain revert it.</div>
        </div>
        <ConnectButton chainStatus="name" showBalance={false} />
      </div>

      {isConnected && !onTestnet && (
        <div className="result-line">
          Sending is limited to Arc Testnet.{' '}
          <button className="btn btn-ghost" style={{ padding: '6px 12px', marginLeft: 8 }} disabled={switching} onClick={() => switchChain({ chainId: ARC_TESTNET_CHAIN_ID })}>
            {switching ? 'Switching…' : 'Switch to Arc Testnet'}
          </button>
        </div>
      )}

      {isConnected && onTestnet && address && (
        <div style={{ marginTop: 18 }}>
          <label className="field-label" htmlFor="testnet-recipient">Recipient (defaults to the testnet blocklisted address)</label>
          <input
            id="testnet-recipient"
            className="input"
            data-state={valid ? undefined : 'invalid'}
            value={recipient}
            onChange={(e) => setRecipient(e.target.value.trim())}
            spellCheck={false}
          />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
            <button className="btn btn-primary" disabled={!valid || busy !== null} onClick={sendGuarded}>
              {busy === 'guarded' ? 'Checking…' : 'Send 0.001 USDC with preflight'}
            </button>
            <button className="btn btn-danger" disabled={!valid || busy !== null} onClick={sendRaw}>
              {busy === 'raw' ? 'Broadcasting…' : 'Send anyway, skip preflight'}
            </button>
          </div>
          <div className="warn-box">
            <b>Bypass warning.</b> “Send anyway” broadcasts without checking. To a blocked address the transaction is included, reverts at Arc’s runtime transfer check, and the gas is gone. This button is never enabled on mainnet.
          </div>

          {outcome?.kind === 'stopped' && (
            <div className="result-line">
              Stopped before broadcast. <span className="mono">{outcome.code}</span> from <span className="mono">{outcome.layer}</span>: <span className="mono">{outcome.reason}</span>. Gas spent: <span className="mono">0</span>.
            </div>
          )}
          {outcome?.kind === 'sent' && (
            <div className="result-line">
              Broadcast <a href={`${ARC_TESTNET_EXPLORER_URL}/tx/${outcome.hash}`} target="_blank" rel="noreferrer">view on explorer</a>.{' '}
              {outcome.status === 'pending' && 'Waiting for the receipt…'}
              {outcome.status === 'reverted' && (
                <>
                  Included and <span className="mono">reverted</span>. Gas consumed: <span className="mono">{outcome.gasUsed?.toString()}</span>
                  {outcome.effectiveGasPrice != null && outcome.gasUsed != null && (
                    <> ≈ <span className="mono">{formatEther(outcome.gasUsed * outcome.effectiveGasPrice)} USDC</span></>
                  )}
                  . That is what preflight saves.
                </>
              )}
              {outcome.status === 'success' && (
                <>Included and <span className="mono">succeeded</span> — the recipient is not blocked on testnet.</>
              )}
            </div>
          )}
          {outcome?.kind === 'error' && <div className="result-line" style={{ color: 'var(--blocked)' }}>{outcome.message}</div>}
        </div>
      )}

      {!isConnected && <div className="result-line">Connect a wallet on Arc Testnet to try it. The read-only check above needs no wallet.</div>}
    </div>
  )
}

function firstLine(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).split('\n')[0]
}
