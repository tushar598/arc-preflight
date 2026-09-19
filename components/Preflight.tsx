'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAccount } from 'wagmi'
import { createPublicClient, http, isAddress, formatEther, type Address, type PublicClient } from 'viem'
import {
  preflight,
  checkSanctions,
  createBlocklistCache,
  sanctionsVersion,
  sanctionsCount,
  MAINNET_DEMO_BLOCKED_ADDRESS,
  TESTNET_BLOCKLISTED_ADDRESS,
  ZERO_ADDRESS,
  MIN_BASE_FEE_WEI,
  type PreflightResult,
  type PreflightLayer,
  type BlocklistCache,
} from 'arc-preflight'
import { CHAINS, type ChainKey } from '@/lib/chains'

/** Zero-balance test account (mnemonic index 0). The probe gives it a virtual balance. */
const DEFAULT_SENDER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const
const CLEAN_ADDRESS = '0x1111111111111111111111111111111111111111' as const
const CACHE_LOOKBACK = 4_000

const LAYERS: { key: PreflightLayer; name: string; detail: string }[] = [
  { key: 'sanctions', name: 'OFAC SDN snapshot', detail: `offline, ${sanctionsCount} addresses, ${sanctionsVersion}` },
  { key: 'cache', name: 'Local blocklist event cache', detail: `USDC Blacklisted events, last ${CACHE_LOOKBACK.toLocaleString()} blocks` },
  { key: 'isBlacklisted', name: 'USDC.isBlacklisted()', detail: 'eth_call to the USDC predeploy' },
  { key: 'simulation', name: 'Native send simulation', detail: 'eth_call with a virtual balance via stateOverride' },
]

type RowStatus = 'idle' | 'running' | 'passed' | 'fired' | 'skipped'

function rowStatuses(result: PreflightResult | null, running: boolean): RowStatus[] {
  if (running) return ['running', 'running', 'running', 'running']
  if (!result) return ['idle', 'idle', 'idle', 'idle']
  if (result.safe) return ['passed', 'passed', 'passed', 'passed']
  const firedAt = LAYERS.findIndex((l) => l.key === result.layer)
  return LAYERS.map((_, i) => (i < firedAt ? 'passed' : i === firedAt ? 'fired' : 'skipped'))
}

const STATUS_LABEL: Record<RowStatus, string> = {
  idle: 'waiting',
  running: 'checking',
  passed: 'clear',
  fired: 'blocked here',
  skipped: 'not needed',
}

function usdc(wei: bigint): string {
  const s = formatEther(wei)
  return s.length > 10 ? Number(s).toPrecision(3) : s
}

export function Preflight({
  initialRecipient = '',
  autoRun = false,
}: {
  initialRecipient?: string
  autoRun?: boolean
}) {
  const { address: connected } = useAccount()
  const [chainKey, setChainKey] = useState<ChainKey>('mainnet')
  const [recipient, setRecipient] = useState(initialRecipient)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<PreflightResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState<number | null>(null)
  const [session, setSession] = useState({ blocked: 0, savedWei: 0n, checks: 0 })
  const [cacheSize, setCacheSize] = useState<number | null>(null)

  const client = useMemo<PublicClient>(
    () => createPublicClient({ chain: CHAINS[chainKey], transport: http() }) as PublicClient,
    [chainKey],
  )
  const caches = useRef<Partial<Record<ChainKey, Promise<BlocklistCache>>>>({})

  const sender: Address = connected ?? DEFAULT_SENDER
  const valid = recipient === '' ? null : isAddress(recipient)
  const sanctioned = valid ? checkSanctions(recipient) : false

  const getCache = useCallback(
    (key: ChainKey, c: PublicClient) => {
      if (!caches.current[key]) {
        caches.current[key] = (async () => {
          const cache = createBlocklistCache(c, { lookbackBlocks: CACHE_LOOKBACK, chunkSize: 2_000 })
          await cache.start()
          cache.stop() // keep the backfilled set; don't leave a poller running in the browser
          return cache
        })()
      }
      return caches.current[key]!
    },
    [],
  )

  const run = useCallback(async () => {
    if (!valid) return
    setRunning(true)
    setError(null)
    setResult(null)
    const t0 = performance.now()
    try {
      const cache = await getCache(chainKey, client)
      setCacheSize(cache.size)
      const r = await preflight(sender, recipient as Address, client, { cache })
      setResult(r)
      setElapsed(Math.round(performance.now() - t0))
      setSession((s) => ({
        checks: s.checks + 1,
        blocked: s.blocked + (r.safe ? 0 : 1),
        savedWei: s.savedWei + (r.safe ? 0n : r.gasEstimate * MIN_BASE_FEE_WEI),
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message.split('\n')[0] : String(err))
    } finally {
      setRunning(false)
    }
  }, [valid, chainKey, client, sender, recipient, getCache])

  const autoRan = useRef(false)
  useEffect(() => {
    if (autoRun && !autoRan.current && valid) {
      autoRan.current = true
      void run()
    }
  }, [autoRun, valid, run])

  const statuses = rowStatuses(result, running)
  const blockedDemo = chainKey === 'mainnet' ? MAINNET_DEMO_BLOCKED_ADDRESS : TESTNET_BLOCKLISTED_ADDRESS
  const gasCostWei = result ? result.gasEstimate * MIN_BASE_FEE_WEI : 0n

  return (
    <div>
      <div className="probe">
        <div className="probe-body">
          <label className="field-label" htmlFor="recipient">
            Recipient
          </label>
          <input
            id="recipient"
            className="input"
            data-state={valid === false ? 'invalid' : undefined}
            value={recipient}
            onChange={(e) => setRecipient(e.target.value.trim())}
            onKeyDown={(e) => e.key === 'Enter' && run()}
            placeholder="0x…"
            spellCheck={false}
            autoComplete="off"
          />
          <div className="chips" role="group" aria-label="Example recipients">
            <button className="chip" aria-pressed={recipient.toLowerCase() === blockedDemo.toLowerCase()} onClick={() => setRecipient(blockedDemo)}>
              {chainKey === 'mainnet' ? 'Blocked on mainnet (OFAC)' : 'Blocked on testnet'}
            </button>
            <button className="chip" aria-pressed={recipient === CLEAN_ADDRESS} onClick={() => setRecipient(CLEAN_ADDRESS)}>
              Clean address
            </button>
            <button className="chip" aria-pressed={recipient === ZERO_ADDRESS} onClick={() => setRecipient(ZERO_ADDRESS)}>
              Zero address
            </button>
          </div>

          <div className="probe-meta">
            <span>
              from <span className="mono">{sender.slice(0, 6)}…{sender.slice(-4)}</span>
              {connected ? ' (your wallet)' : ' (test account, no balance needed)'}
            </span>
            <span className="seg" role="group" aria-label="Network">
              <button aria-pressed={chainKey === 'mainnet'} onClick={() => { setChainKey('mainnet'); setResult(null) }}>Arc mainnet</button>
              <button aria-pressed={chainKey === 'testnet'} onClick={() => { setChainKey('testnet'); setResult(null) }}>Testnet</button>
            </span>
          </div>

          <div style={{ marginTop: 18, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={run} disabled={!valid || running}>
              {running ? 'Checking…' : 'Run preflight'}
            </button>
            <span className="note">
              Read-only. No wallet needed. {valid === false && 'Enter a valid 0x address.'}
            </span>
          </div>
        </div>

        {error && <div className="error-box">{error}</div>}

        {(result || running) && (
          <div className="verdict" aria-live="polite">
            <div className="verdict-head">
              <span className="verdict-badge" data-safe={result ? String(result.safe) : undefined}>
                {running ? '…' : result?.safe ? 'SAFE' : 'BLOCKED'}
              </span>
              {result && !result.safe && result.reasonCode && <span className="verdict-code">{result.reasonCode}</span>}
              {result && elapsed !== null && <span className="note">{elapsed} ms</span>}
            </div>
            {result && (
              <div className="verdict-reason">
                {result.safe
                  ? 'Every layer is clear. Submitting this transfer would succeed.'
                  : <>Arc would revert this transfer: <span className="mono">{result.revertReason}</span></>}
              </div>
            )}

            <ol className="ledger">
              {LAYERS.map((l, i) => (
                <li key={l.key} data-status={statuses[i]}>
                  <span className="n">{i + 1}</span>
                  <span className="name">
                    {l.name}
                    <small>
                      {l.key === 'cache' && cacheSize !== null ? `${cacheSize} cached, last ${CACHE_LOOKBACK.toLocaleString()} blocks` : l.detail}
                      {l.key === 'sanctions' && valid && ` — ${sanctioned ? 'hit' : 'miss'}`}
                    </small>
                  </span>
                  <span className="status">{STATUS_LABEL[statuses[i]]}</span>
                </li>
              ))}
            </ol>

            {result && (
              <div className="verdict-foot">
                {result.safe ? (
                  <span>Live gas estimate <strong>{result.gasEstimate.toLocaleString()}</strong> ≈ <strong>{usdc(gasCostWei)} USDC</strong> at 20 Gwei</span>
                ) : (
                  <span>Gas you did not spend <strong>{result.gasEstimate.toLocaleString()}</strong> ≈ <strong>{usdc(gasCostWei)} USDC</strong> at 20 Gwei</span>
                )}
                <span>Verdict from <strong>{result.layer}</strong></span>
                {result.recipientsChecked && result.recipientsChecked.length > 1 && (
                  <span className="list">Checked: {result.recipientsChecked.join(', ')}</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="tally">
        <span>This session: <strong>{session.checks}</strong> checks</span>
        <span><strong>{session.blocked}</strong> blocked</span>
        <span>gas saved <strong>{usdc(session.savedWei)} USDC</strong></span>
      </div>
    </div>
  )
}
