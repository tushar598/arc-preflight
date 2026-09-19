import { describe, it, expect, vi } from 'vitest'
import { createPublicClient, custom, encodeEventTopics } from 'viem'
import { createBlocklistCache, preflight, USDC_ADDRESS, USDC_EVENTS_ABI } from '../../src/index.js'
import { fakeArc, SENDER, CLEAN, CLEAN2 } from '../helpers/fakeArc.js'

const HEAD = 0x100000n

/** Build a raw JSON-RPC log for a Blacklisted / UnBlacklisted event. */
const rawLog = (event: 'Blacklisted' | 'UnBlacklisted', account: `0x${string}`, block: bigint) => ({
  address: USDC_ADDRESS,
  topics: encodeEventTopics({ abi: USDC_EVENTS_ABI, eventName: event, args: { _account: account } }),
  data: '0x',
  blockNumber: `0x${block.toString(16)}`,
  blockHash: `0x${'ab'.repeat(32)}`,
  transactionHash: `0x${'cd'.repeat(32)}`,
  transactionIndex: '0x0',
  logIndex: '0x0',
  removed: false,
})

function clientWithLogs(logs: ReturnType<typeof rawLog>[], opts: { failFirstGetLogs?: boolean } = {}) {
  const rpc = fakeArc()
  const ranges: Array<[bigint, bigint]> = []
  const base = rpc.request
  let getLogsCalls = 0
  rpc.request = async (args) => {
    if (args.method === 'eth_getLogs') {
      if (opts.failFirstGetLogs && getLogsCalls++ === 0) throw new Error('requested range too large')
      const f = (args.params?.[0] ?? {}) as { fromBlock: string; toBlock: string }
      const from = BigInt(f.fromBlock)
      const to = BigInt(f.toBlock)
      ranges.push([from, to])
      return logs.filter((l) => BigInt(l.blockNumber) >= from && BigInt(l.blockNumber) <= to)
    }
    return base(args)
  }
  const client = createPublicClient({ transport: custom({ request: rpc.request }, { retryCount: 0 }) })
  // Don't let viem actually start polling filters in unit tests.
  const onLogsRef: { current?: (logs: unknown[]) => void } = {}
  vi.spyOn(client, 'watchContractEvent').mockImplementation((args: unknown) => {
    onLogsRef.current = (args as { onLogs: (logs: unknown[]) => void }).onLogs
    return () => {}
  })
  return { client, rpc, ranges, onLogsRef }
}

describe('createBlocklistCache()', () => {
  it('starts empty, learns from live events, and short-circuits preflight', async () => {
    const { client, onLogsRef } = clientWithLogs([])
    const cache = createBlocklistCache(client, { lookbackBlocks: 0 })
    expect(cache.isRunning).toBe(false)
    expect(cache.size).toBe(0)
    expect(cache.startedAt).toBeNull()

    await cache.start()
    expect(cache.isRunning).toBe(true)
    expect(cache.startedAt).toBeInstanceOf(Date)
    expect(cache.backfilledFromBlock).toBeNull()

    onLogsRef.current!([{ eventName: 'Blacklisted', args: { _account: CLEAN } }])
    expect(cache.has(CLEAN)).toBe(true)
    expect(cache.has(CLEAN.toLowerCase())).toBe(true)
    expect(cache.size).toBe(1)

    const r = await preflight(SENDER, CLEAN, client, { cache })
    expect(r).toMatchObject({ safe: false, layer: 'cache', revertReason: 'Blocked address (cached)' })

    onLogsRef.current!([{ eventName: 'UnBlacklisted', args: { _account: CLEAN } }])
    expect(cache.has(CLEAN)).toBe(false)

    cache.stop()
    expect(cache.isRunning).toBe(false)
  })

  it('backfills from lookbackBlocks in chunks and applies un-blacklist ordering', async () => {
    const logs = [
      rawLog('Blacklisted', CLEAN, HEAD - 9_000n),
      rawLog('Blacklisted', CLEAN2, HEAD - 5_000n),
      rawLog('UnBlacklisted', CLEAN, HEAD - 100n),
    ]
    const { client, ranges } = clientWithLogs(logs)
    const cache = createBlocklistCache(client, { lookbackBlocks: 10_000, chunkSize: 2_000 })
    await cache.start()

    expect(cache.backfilledFromBlock).toBe(HEAD - 10_000n)
    expect(ranges.length).toBe(6) // 10_001 blocks / 2_000 per chunk → 6 requests
    expect(ranges[0]).toEqual([HEAD - 10_000n, HEAD - 8_001n])
    expect(ranges[ranges.length - 1][1]).toBe(HEAD)
    expect(cache.has(CLEAN)).toBe(false) // un-blacklisted later
    expect(cache.has(CLEAN2)).toBe(true)
    expect(cache.size).toBe(1)
  })

  it('explicit fromBlock wins over lookback and is capped by maxLookbackBlocks only for lookback', async () => {
    const { client, ranges } = clientWithLogs([])
    const cache = createBlocklistCache(client, { fromBlock: HEAD - 3n, lookbackBlocks: 1_000_000, chunkSize: 2 })
    await cache.start()
    expect(cache.backfilledFromBlock).toBe(HEAD - 3n)
    expect(ranges).toEqual([[HEAD - 3n, HEAD - 2n], [HEAD - 1n, HEAD]])
  })

  it('caps lookback to maxLookbackBlocks', async () => {
    const { client } = clientWithLogs([])
    const cache = createBlocklistCache(client, { lookbackBlocks: 1_000_000, maxLookbackBlocks: 4_000, chunkSize: 4_000 })
    await cache.start()
    expect(cache.backfilledFromBlock).toBe(HEAD - 4_000n)
  })

  it('reports backfill chunk errors and continues', async () => {
    const { client } = clientWithLogs([], { failFirstGetLogs: true })
    const errors: unknown[] = []
    const cache = createBlocklistCache(client, { lookbackBlocks: 4_000, chunkSize: 2_000, onBackfillError: (e) => errors.push(e) })
    await cache.start()
    expect(errors).toHaveLength(1)
    expect(cache.isRunning).toBe(true)
  })

  it('start() is idempotent', async () => {
    const { client } = clientWithLogs([])
    const cache = createBlocklistCache(client, { lookbackBlocks: 0 })
    await cache.start()
    const first = cache.startedAt
    await cache.start()
    expect(cache.startedAt).toBe(first)
  })
})
