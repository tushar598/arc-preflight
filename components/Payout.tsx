'use client'

import { useEffect, useMemo, useState } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useChainId, useSwitchChain, useWalletClient } from 'wagmi'
import {
  createPublicClient,
  formatEther,
  http,
  isAddress,
  keccak256,
  parseEther,
  toHex,
  type Address,
  type Hash,
  type PublicClient,
  type WalletClient,
} from 'viem'
import {
  planPayout,
  readPayoutStats,
  parsePayoutLogs,
  withPreflight,
  PreflightError,
  PREFLIGHT_PAYOUT_ADDRESS,
  TESTNET_BLOCKLISTED_ADDRESS,
  ZERO_ADDRESS,
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_EXPLORER_URL,
  type Payee,
  type PayoutPlan,
  type PayoutReceipt,
  type PayoutStats,
} from 'arc-preflight'
import { arcTestnet } from '@/lib/chains'

/** Same zero-balance test account the read-only check uses; the probe gives it a virtual balance. */
const PREVIEW_PAYER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const

const DEFAULT_LINES = [
  '0x1111111111111111111111111111111111111111, 0.001',
  `${TESTNET_BLOCKLISTED_ADDRESS}, 0.001`,
  `${ZERO_ADDRESS}, 0.001`,
  '0x2222222222222222222222222222222222222222, 0.001',
].join('\n')

type Parsed = { payees: Payee[]; error: string | null }

function parseLines(text: string): Parsed {
  const payees: Payee[] = []
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  for (const [i, line] of lines.entries()) {
    const [to, amount] = line.split(/[\s,;]+/)
    if (!to || !isAddress(to)) return { payees, error: `Line ${i + 1}: not an address` }
    let wei: bigint
    try {
      wei = parseEther(amount ?? '')
    } catch {
      return { payees, error: `Line ${i + 1}: amount must be a USDC number like 0.001` }
    }
    if (wei <= 0n) return { payees, error: `Line ${i + 1}: amount must be above 0` }
    payees.push({ to: to as Address, amount: wei })
  }
  if (payees.length === 0) return { payees, error: 'Add at least one payee' }
  return { payees, error: null }
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

type Sent = { hash: Hash; status: 'pending' | 'success' | 'reverted'; receipt?: PayoutReceipt; included: Address[] }

export function Payout() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain, isPending: switching } = useSwitchChain()
  const { data: walletClient } = useWalletClient()
  const client = useMemo(() => createPublicClient({ chain: arcTestnet, transport: http() }) as PublicClient, [])

  const [text, setText] = useState(DEFAULT_LINES)
  const [includeSkipped, setIncludeSkipped] = useState(true)
  const [plan, setPlan] = useState<PayoutPlan | null>(null)
  const [busy, setBusy] = useState<'plan' | 'send' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<Sent | null>(null)
  const [stats, setStats] = useState<PayoutStats | null | undefined>(undefined)
  const [statsTick, setStatsTick] = useState(0)

  const parsed = useMemo(() => parseLines(text), [text])
  const onTestnet = chainId === ARC_TESTNET_CHAIN_ID
  const deployed = stats != null

  useEffect(() => {
    let live = true
    readPayoutStats(client).then(
      (s) => live && setStats(s),
      () => live && setStats(null),
    )
    return () => { live = false }
  }, [client, statsTick])

  async function preview() {
    if (parsed.error) return
    setBusy('plan')
    setError(null)
    setSent(null)
    try {
      setPlan(await planPayout(address ?? PREVIEW_PAYER, parsed.payees, client, { includeSkipped }))
    } catch (err) {
      setError(firstLine(err))
    } finally {
      setBusy(null)
    }
  }

  async function pay() {
    if (!walletClient || !address || parsed.error) return
    setBusy('send')
    setError(null)
    setSent(null)
    try {
      // Re-plan with the real payer: a blocked payer is caught here, before any gas.
      const ref = keccak256(toHex(`arc-preflight demo ${address} ${Date.now()}`))
      const p = await planPayout(address, parsed.payees, client, { includeSkipped, ref })
      setPlan(p)
      if (!p.tx) {
        setError('Every payee would be skipped, so there is nothing to send.')
        return
      }
      const included = includeSkipped ? p.entries.map((e) => e.to) : p.pay.map((e) => e.to)
      const guarded = withPreflight(walletClient as unknown as WalletClient, client)
      const hash = await guarded.sendTransaction({ ...p.tx, account: walletClient.account, chain: arcTestnet })
      setSent({ hash, status: 'pending', included })
      const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 })
      setSent({ hash, status: receipt.status, receipt: parsePayoutLogs(receipt.logs), included })
      setStatsTick((t) => t + 1)
    } catch (err) {
      setError(err instanceof PreflightError ? `Stopped before broadcast: ${err.reasonCode} — ${err.revertReason}` : firstLine(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="wallet">
      <div className="wallet-row">
        <div>
          <b style={{ fontWeight: 500 }}>Batch payout through PreflightPayout</b>
          <div className="note">
            Contract{' '}
            <a className="mono link" href={`${ARC_TESTNET_EXPLORER_URL}/address/${PREFLIGHT_PAYOUT_ADDRESS}`} target="_blank" rel="noreferrer">
              {short(PREFLIGHT_PAYOUT_ADDRESS)}
            </a>{' '}
            on Arc Testnet, same address on mainnet.
          </div>
        </div>
        <ConnectButton chainStatus="name" showBalance={false} />
      </div>

      <div className="tally" style={{ marginTop: 14 }}>
        {stats === undefined && <span>Reading contract…</span>}
        {stats === null && <span>Not deployed on Arc Testnet yet. The preview still works.</span>}
        {stats && (
          <>
            <span>On-chain so far: <strong>{stats.batches.toString()}</strong> batches</span>
            <span><strong>{stats.paidCount.toString()}</strong> paid</span>
            <span><strong>{stats.skippedCount.toString()}</strong> skipped</span>
            <span><strong>{formatEther(stats.protectedValue)} USDC</strong> refunded instead of lost</span>
          </>
        )}
      </div>

      <div style={{ marginTop: 18 }}>
        <label className="field-label" htmlFor="payees">Payees, one per line: address, USDC amount</label>
        <textarea
          id="payees"
          className="input"
          rows={5}
          data-state={parsed.error && text.trim() ? 'invalid' : undefined}
          value={text}
          onChange={(e) => { setText(e.target.value); setPlan(null); setSent(null) }}
          spellCheck={false}
          style={{ resize: 'vertical', lineHeight: 1.6 }}
        />
        <label className="note check">
          <input type="checkbox" checked={includeSkipped} onChange={(e) => { setIncludeSkipped(e.target.checked); setPlan(null) }} />
          Send blocked payees through the contract too. It refunds them and writes a <span className="mono">Skipped</span> event, so the screening is on-chain.
        </label>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14, alignItems: 'center' }}>
          <button className="btn btn-ghost" disabled={!!parsed.error || busy !== null} onClick={preview}>
            {busy === 'plan' ? 'Checking…' : 'Preview'}
          </button>
          {isConnected && onTestnet && (
            <button className="btn btn-primary" disabled={!!parsed.error || busy !== null || !deployed} onClick={pay}>
              {busy === 'send' ? 'Paying…' : `Pay ${parsed.payees.length} payees`}
            </button>
          )}
          {isConnected && !onTestnet && (
            <button className="btn btn-ghost" disabled={switching} onClick={() => switchChain({ chainId: ARC_TESTNET_CHAIN_ID })}>
              {switching ? 'Switching…' : 'Switch to Arc Testnet to pay'}
            </button>
          )}
          <span className="note">{parsed.error ?? (isConnected ? '' : 'Preview needs no wallet. Connect one on testnet to pay.')}</span>
        </div>
      </div>

      {error && <div className="result-line" style={{ color: 'var(--blocked)' }}>{error}</div>}

      {plan && (
        <ol className="ledger payees">
          {plan.entries.map((e, i) => {
            const outcome = rowOutcome(e.to, sent)
            const fired = outcome ? outcome.kind === 'skipped' : !e.safe
            return (
              <li key={i} data-status={fired ? 'fired' : 'passed'}>
                <span className="n">{i + 1}</span>
                <span className="name">
                  <span className="mono">{short(e.to)}</span> · {formatEther(e.amount)} USDC
                  <small>
                    {outcome?.kind === 'paid' && 'paid on-chain'}
                    {outcome?.kind === 'skipped' && <>refunded on-chain · {outcome.detail}</>}
                    {outcome?.kind === 'left-out' && <>left out by the planner · {e.revertReason}</>}
                    {!outcome && (e.safe ? 'will be paid' : <>{e.revertReason} · caught by {e.layer}</>)}
                  </small>
                </span>
                <span className="status">
                  {outcome?.kind === 'paid' ? 'paid' : outcome?.kind === 'skipped' ? `refunded · ${outcome.code}` : e.safe ? 'pay' : `skip · ${e.reasonCode}`}
                </span>
              </li>
            )
          })}
        </ol>
      )}

      {plan && !sent && (
        <div className="result-line">
          Will pay <span className="mono">{formatEther(plan.payValue)} USDC</span>
          {plan.skip.length > 0 && <>, skip <span className="mono">{plan.skip.length}</span> ({formatEther(plan.skipValue)} USDC stays with you)</>}.
          {' '}One transaction. The batch does not revert because of a bad payee.
        </div>
      )}

      {sent && (
        <div className="result-line">
          <a href={`${ARC_TESTNET_EXPLORER_URL}/tx/${sent.hash}`} target="_blank" rel="noreferrer">View on explorer</a>.{' '}
          {sent.status === 'pending' && 'Waiting for the receipt…'}
          {sent.status === 'reverted' && <>The transaction <span className="mono">reverted</span>.</>}
          {sent.status === 'success' && sent.receipt && (
            <>
              Included and succeeded. Paid <span className="mono">{formatEther(sent.receipt.paidValue)} USDC</span>
              {sent.receipt.skipped.length > 0 && <>, refunded <span className="mono">{formatEther(sent.receipt.refundedValue)} USDC</span> for {sent.receipt.skipped.length} blocked payee{sent.receipt.skipped.length > 1 ? 's' : ''}</>}.
            </>
          )}
        </div>
      )}
    </div>
  )
}

type RowOutcome =
  | { kind: 'paid' }
  | { kind: 'skipped'; code: string; detail: string }
  | { kind: 'left-out' }

function rowOutcome(to: Address, sent: Sent | null): RowOutcome | null {
  if (!sent?.receipt) return null
  const lc = to.toLowerCase()
  if (!sent.included.some((a) => a.toLowerCase() === lc)) return { kind: 'left-out' }
  if (sent.receipt.paid.some((p) => p.payee.toLowerCase() === lc)) return { kind: 'paid' }
  const s = sent.receipt.skipped.find((p) => p.payee.toLowerCase() === lc)
  return s ? { kind: 'skipped', code: s.reasonCode, detail: s.detail } : null
}

function firstLine(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).split('\n')[0]
}
