/**
 * types.ts
 *
 * Shared TypeScript types for the arc-preflight SDK.
 */

import type { Address } from 'viem'

/**
 * The result returned by `preflight()`.
 *
 * @example
 * ```ts
 * const result = await preflight(sender, recipient, client)
 * if (!result.safe) {
 *   console.error('Transfer would revert:', result.revertReason)
 *   return
 * }
 * // proceed with sendTransaction
 * ```
 */
export type PreflightResult = {
  /**
   * `true` when the simulated transfer succeeded — the transfer is safe to submit.
   * `false` when the transfer would revert (e.g., blocklisted address).
   */
  safe: boolean

  /**
   * The revert reason string when `safe` is `false`.
   * `null` when `safe` is `true`.
   *
   * Common values on Arc:
   * - `"runtime-transfer-check"` — sender or recipient is blocklisted
   * - `"Zero address not allowed"` — recipient is 0x0
   */
  revertReason: string | null

  /**
   * Estimated gas units for this transfer type on Arc.
   * Useful for calculating the USDC cost saved by catching a revert early.
   *
   * Gas cost in USDC = `gasEstimate × baseFeePerGas / 1e18`
   * Minimum base fee on Arc is 20 Gwei (see constants.ts).
   */
  gasEstimate: bigint
}

/**
 * A local cache that tracks on-chain blocklist events (e.g. USDC Blacklisted).
 * Used to skip the RPC preflight check for known blocked addresses.
 */
export interface BlocklistCache {
  /** Returns true if the address is currently in the local cache */
  has(address: string): boolean
  /** Starts the event listener */
  start(): void
  /** Stops the event listener */
  stop(): void
  /** Returns true if the event listener is currently active */
  get isRunning(): boolean
}

/**
 * Options accepted by `preflight()`.
 */
export type PreflightOptions = {
  /**
   * Amount of native USDC (in wei, 18 decimals) to simulate sending.
   *
   * Defaults to `1n` — just enough to trigger Arc's runtime blocklist check.
   * A higher value produces a more accurate gas estimate but doesn't change
   * whether the blocklist check fires (any non-zero value is sufficient).
   *
   * Do NOT use 0 — a zero-value send does not trigger the blocklist check.
   */
  simulatedValue?: bigint

  /**
   * Optional local blocklist cache. If provided and the recipient is
   * found in the cache, the preflight will return safe:false immediately
   * without making an RPC call.
   */
  cache?: BlocklistCache
}

/** Re-export Address for convenience */
export type { Address }
