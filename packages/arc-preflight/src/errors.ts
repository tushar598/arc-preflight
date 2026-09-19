/**
 * errors.ts
 *
 * Custom error classes for the arc-preflight SDK.
 */

/**
 * Thrown by `withPreflight()` when a transfer would revert on Arc.
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
 *     console.log('Blocked:', err.revertReason)
 *   }
 * }
 * ```
 */
export class PreflightError extends Error {
  /** The raw revert reason string from Arc's runtime check. */
  readonly revertReason: string

  constructor(revertReason: string) {
    super(`arc-preflight: transfer would revert — ${revertReason}`)
    this.name = 'PreflightError'
    this.revertReason = revertReason

    // Maintain correct prototype chain in environments that transpile to ES5
    Object.setPrototypeOf(this, new.target.prototype)
  }
}
