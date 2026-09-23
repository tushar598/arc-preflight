/**
 * types.ts
 *
 * Shared TypeScript types for the arc-preflight SDK.
 */

import type { Address, Hex } from 'viem'

/**
 * Machine-readable classification of why a transfer would revert.
 *
 * - `BLOCKLIST`          — sender or recipient is on Arc's runtime blocklist
 * - `ZERO_ADDRESS`       — value-bearing send to 0x0 (forbidden on Arc)
 * - `PRECOMPILE`         — destination is a precompile and the call reverted
 * - `BURN_FORBIDDEN`     — the transfer would burn USDC (e.g. to a self-destructed account)
 * - `INSUFFICIENT_FUNDS` — balance / gas shortfall (only seen without stateOverride)
 * - `UNKNOWN`            — reverted for a reason we could not classify
 */
export type PreflightReasonCode =
  | 'BLOCKLIST'
  | 'ZERO_ADDRESS'
  | 'PRECOMPILE'
  | 'BURN_FORBIDDEN'
  | 'INSUFFICIENT_FUNDS'
  | 'UNKNOWN'

/**
 * Which layer of the check produced the verdict.
 *
 * Order of evaluation is `sanctions` → `cache` → `isBlacklisted` → `simulation`.
 * The first three can only prove a BLOCKLIST hit; `simulation` (an `eth_call`
 * of the native value transfer) is ground truth and always runs unless an
 * earlier layer already proved the transfer is blocked.
 */
export type PreflightLayer = 'sanctions' | 'cache' | 'isBlacklisted' | 'simulation'

/**
 * The result returned by `preflight()`.
 *
 * @example
 * ```ts
 * const result = await preflight(sender, recipient, client)
 * if (!result.safe) {
 *   console.error(`Transfer would revert [${result.reasonCode}]:`, result.revertReason)
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
   * The human-readable revert reason when `safe` is `false`; `null` when safe.
   *
   * Common values on Arc:
   * - `"Blocked address"`           — sender or recipient is blocklisted
   * - `"Zero address not allowed"`  — recipient is 0x0
   */
  revertReason: string | null

  /** Machine-readable classification of the revert. Absent when `safe` is `true`. */
  reasonCode?: PreflightReasonCode

  /**
   * Gas units for this transfer. A live `eth_estimateGas` when the transfer is
   * safe; the documented fallback constant (`USDC_TRANSFER_GAS_ESTIMATE`) when
   * it would revert, since a reverting call cannot be estimated.
   *
   * Gas cost in USDC = `gasEstimate × baseFeePerGas / 1e18`
   * Minimum base fee on Arc is 20 Gwei (see constants.ts).
   */
  gasEstimate: bigint

  /** Which check layer produced the verdict. */
  layer?: PreflightLayer

  /**
   * Every recipient address that was checked. More than one when calldata
   * (ERC-20 `transfer`, Memo, Multicall3From) was decoded into several
   * inner transfers.
   */
  recipientsChecked?: Address[]
}

/**
 * A local cache that tracks on-chain blocklist events (USDC `Blacklisted` /
 * `UnBlacklisted`). Used to skip the RPC preflight check for known blocked
 * addresses.
 */
export interface BlocklistCache {
  /** Returns true if the address is currently in the local cache */
  has(address: string): boolean
  /**
   * Starts the event listener. Resolves once the historical backfill (if any)
   * has completed; the live watcher is active immediately.
   */
  start(): Promise<void>
  /** Stops the event listener */
  stop(): void
  /** Returns true if the event listener is currently active */
  get isRunning(): boolean
  /** Number of addresses currently in the cache */
  get size(): number
  /** When `start()` was last called, or `null` if never started */
  get startedAt(): Date | null
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
   * May be `0n` only when `data` decodes to at least one inner transfer.
   */
  simulatedValue?: bigint

  /**
   * Optional local blocklist cache. If provided and the sender or recipient
   * is found in the cache, the preflight returns `safe: false` immediately
   * without making an RPC call.
   */
  cache?: BlocklistCache

  /**
   * Optional transaction calldata. When present, the SDK decodes ERC-20
   * `transfer` / `transferFrom` / EIP-3009 calls, `Memo.memo(...)` wrappers
   * and `Multicall3From` batches, and checks every inner sender/recipient
   * pair in addition to the top-level native value transfer (if any).
   */
  data?: Hex
}

/**
 * The smallest JSON-RPC surface the SDK needs. Both viem's `PublicClient`
 * (`client.request`) and ethers' `JsonRpcProvider` (`provider.send`) are
 * adapted to this shape so the core probe is shared between adapters.
 */
export interface RpcTransport {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
}

/** A single sender → recipient value movement extracted from a transaction. */
export type TransferIntent = {
  from: Address
  to: Address
  /** Native wei (18 decimals) for `native`; token units for the others. */
  value: bigint
  /** How this intent was discovered. */
  via: 'native' | 'erc20' | 'memo' | 'multicall3from' | 'payout'
  /**
   * Calldata to simulate with instead of a bare value send. Set for `payout`
   * intents: the payer's funds go to PreflightPayout, which only accepts them
   * through `payMany`, so the real call is what gets simulated.
   */
  data?: Hex
}

/** Result of `preflightMany()`. */
export type PreflightManyResult = {
  results: PreflightResult[]
  safeCount: number
  blockedCount: number
}

/** Re-export Address / Hex for convenience */
export type { Address, Hex }
