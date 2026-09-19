import { type PublicClient } from 'viem'
import { USDC_ADDRESS, USDC_EVENTS_ABI } from './constants.js'
import { type BlocklistCache } from './types.js'

/**
 * Creates an event-driven blocklist cache that listens to on-chain
 * USDC Blacklisted/UnBlacklisted events.
 * 
 * @param client Viem PublicClient used to listen for events
 * @returns A BlocklistCache instance to pass into preflight options
 */
export function createBlocklistCache(client: PublicClient): BlocklistCache {
  const blocklist = new Set<string>()
  let unwatch: (() => void) | null = null

  return {
    get isRunning() {
      return unwatch !== null
    },
    has(address: string) {
      return blocklist.has(address.toLowerCase())
    },
    start() {
      if (unwatch) return
      unwatch = client.watchContractEvent({
        address: USDC_ADDRESS,
        abi: USDC_EVENTS_ABI,
        onLogs: logs => {
          for (const log of logs) {
            const eventName = log.eventName
            const account = (log.args as { _account?: string })?._account?.toLowerCase()
            if (!account) continue

            if (eventName === 'Blacklisted') {
              blocklist.add(account)
            } else if (eventName === 'UnBlacklisted') {
              blocklist.delete(account)
            }
          }
        },
      })
    },
    stop() {
      if (unwatch) {
        unwatch()
        unwatch = null
      }
    }
  }
}
