/**
 * cache.ts
 *
 * Optional local blocklist cache driven by USDC `Blacklisted` /
 * `UnBlacklisted` events.
 *
 * Without backfill the Set starts EMPTY and only learns about addresses
 * blocklisted after `start()`. Pass `lookbackBlocks` / `fromBlock` to seed it
 * from recent history via `eth_getLogs` (chunked, because Arc's public RPC
 * rejects ranges larger than a few thousand blocks).
 */

import type { PublicClient } from 'viem'
import { USDC_ADDRESS, USDC_EVENTS_ABI } from './constants.js'
import type { BlocklistCache } from './types.js'

export type BlocklistCacheOptions = {
  /**
   * Explicit block to backfill from. Takes precedence over `lookbackBlocks`.
   */
  fromBlock?: bigint
  /**
   * How many blocks before the current head to backfill. Default 10_000.
   * Set to `0` to disable backfill entirely. Capped at `maxLookbackBlocks`.
   */
  lookbackBlocks?: number
  /** Hard cap on the backfill window. Default 100_000. */
  maxLookbackBlocks?: number
  /** Blocks per `eth_getLogs` request. Default 2_000 (Arc public RPC safe). */
  chunkSize?: number
  /** Called when a backfill chunk fails. Backfill continues with the next chunk. */
  onBackfillError?: (err: unknown, fromBlock: bigint, toBlock: bigint) => void
}

/**
 * Creates an event-driven blocklist cache that listens to on-chain
 * USDC Blacklisted/UnBlacklisted events.
 *
 * @param client  Viem PublicClient used to backfill and watch events
 * @param options Backfill configuration
 * @returns A BlocklistCache instance to pass into preflight options
 */
export function createBlocklistCache(
  client: PublicClient,
  options: BlocklistCacheOptions = {},
): BlocklistCache & { readonly backfilledFromBlock: bigint | null } {
  const blocklist = new Set<string>()
  let unwatch: (() => void) | null = null
  let startedAt: Date | null = null
  let backfilledFromBlock: bigint | null = null

  const lookback = BigInt(Math.max(0, options.lookbackBlocks ?? 10_000))
  const maxLookback = BigInt(Math.max(0, options.maxLookbackBlocks ?? 100_000))
  const chunk = BigInt(Math.max(1, options.chunkSize ?? 2_000))

  type EventLog = { eventName?: string; args?: { _account?: string } }

  const apply = (logs: readonly EventLog[]) => {
    for (const log of logs) {
      const account = log.args?._account?.toLowerCase()
      if (!account) continue
      if (log.eventName === 'Blacklisted') blocklist.add(account)
      else if (log.eventName === 'UnBlacklisted') blocklist.delete(account)
    }
  }

  const backfill = async () => {
    let from: bigint
    const head = await client.getBlockNumber()
    if (options.fromBlock != null) {
      from = options.fromBlock
    } else {
      const window = lookback > maxLookback ? maxLookback : lookback
      if (window === 0n) return
      from = head > window ? head - window : 0n
    }
    backfilledFromBlock = from

    for (let start = from; start <= head; start += chunk) {
      const end = start + chunk - 1n > head ? head : start + chunk - 1n
      try {
        const logs = await client.getLogs({
          address: USDC_ADDRESS,
          events: USDC_EVENTS_ABI,
          fromBlock: start,
          toBlock: end,
        })
        apply(logs as readonly EventLog[])
      } catch (err) {
        options.onBackfillError?.(err, start, end)
      }
    }
  }

  return {
    get isRunning() {
      return unwatch !== null
    },
    get size() {
      return blocklist.size
    },
    get startedAt() {
      return startedAt
    },
    get backfilledFromBlock() {
      return backfilledFromBlock
    },
    has(address: string) {
      return blocklist.has(address.toLowerCase())
    },
    async start() {
      if (unwatch) return
      startedAt = new Date()
      // Live watcher first so nothing is missed while the backfill runs.
      unwatch = client.watchContractEvent({
        address: USDC_ADDRESS,
        abi: USDC_EVENTS_ABI,
        onLogs: (logs) => apply(logs as readonly EventLog[]),
      })
      await backfill()
    },
    stop() {
      if (unwatch) {
        unwatch()
        unwatch = null
      }
    },
  }
}
