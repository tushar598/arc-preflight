/**
 * errors.ts
 *
 * Custom error classes for the arc-preflight SDK.
 */

import type { PreflightLayer, PreflightReasonCode, PreflightResult } from './types.js'

/**
 * Thrown by `withPreflight()` / `withPreflightEthers()` when a transfer would
 * revert on Arc.
 *
 * Callers can check `instanceof PreflightError` to distinguish this from
 * other errors (e.g., network errors, insufficient balance).
 *
 * @example
 * ```ts
 * try {
 *   await guardedClient.sendTransaction({ to, value })
 * } catch (err) {
 *   if (err instanceof PreflightError) {
 *     console.log('Blocked:', err.reasonCode, err.layer, err.revertReason)
 *   }
 * }
 * ```
 */
export class PreflightError extends Error {
  /** The raw revert reason string from Arc's runtime check. */
  readonly revertReason: string
  /** Machine-readable classification (BLOCKLIST, ZERO_ADDRESS, …). */
  readonly reasonCode: PreflightReasonCode
  /** Which check layer produced the verdict. */
  readonly layer: PreflightLayer | undefined
  /** The full preflight result, if available. */
  readonly result: PreflightResult | undefined

  constructor(revertReason: string, result?: PreflightResult) {
    super(`arc-preflight: transfer would revert — ${revertReason}`)
    this.name = 'PreflightError'
    this.revertReason = revertReason
    this.reasonCode = result?.reasonCode ?? 'UNKNOWN'
    this.layer = result?.layer
    this.result = result

    // Maintain correct prototype chain in environments that transpile to ES5
    Object.setPrototypeOf(this, new.target.prototype)
  }
}
