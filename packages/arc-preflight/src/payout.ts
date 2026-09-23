/**
 * payout.ts
 *
 * Off-chain half of PreflightPayout, the on-chain batch payout contract.
 *
 *   planPayout   — run the preflight layers over every payee, predict which ones
 *                  the contract will pay and which it will skip, and build the
 *                  `payMany` transaction (blocked payees left out by default).
 *   parsePayoutLogs — turn a receipt's logs into { paid, skipped, refunded }.
 *   readPayoutStats — the contract's lifetime counters, or null if not deployed.
 *
 * The two halves agree by construction: the plan applies the same static rules
 * as the contract (zero address, precompile, USDC.isBlacklisted) plus the full
 * simulation, and the contract is the backstop for anything that changes
 * between planning and inclusion.
 */

import { decodeEventLog, decodeFunctionResult, encodeFunctionData, type Address, type Hex } from 'viem'
import { PREFLIGHT_PAYOUT_ABI, PREFLIGHT_PAYOUT_ADDRESS, ZERO_ADDRESS } from './constants.js'
import { runPreflightMany, type PreflightManyOptions } from './batch.js'
import { isPrecompileAddress } from './revert.js'
import type { PreflightLayer, PreflightReasonCode, RpcTransport } from './types.js'

/** One line of a payout: native USDC wei (18 decimals) to `to`. */
export type Payee = { to: Address; amount: bigint }

export type PayoutPlanEntry = Payee & {
  /** Whether the contract will pay this payee. */
  safe: boolean
  reasonCode?: PreflightReasonCode
  revertReason: string | null
  layer?: PreflightLayer | 'contract'
}

export type PayoutPlan = {
  entries: PayoutPlanEntry[]
  pay: PayoutPlanEntry[]
  skip: PayoutPlanEntry[]
  payValue: bigint
  skipValue: bigint
  /**
   * Ready for `sendTransaction`. `null` when every payee would be skipped —
   * there is nothing worth paying gas for.
   */
  tx: { to: Address; value: bigint; data: Hex } | null
}

export type PlanPayoutOptions = PreflightManyOptions & {
  /** Batch reference stored in every event (payroll run id, invoice hash). Default 0x0…0. */
  ref?: Hex
  /**
   * Keep payees the plan expects to be skipped in the transaction. The contract
   * then refunds them and records a `Skipped` event — an on-chain audit trail
   * of the screening — at a little extra gas. Default false.
   */
  includeSkipped?: boolean
  /** Override the contract address (local forks, tests). */
  address?: Address
}

const ZERO_REF = `0x${'00'.repeat(32)}` as const

/** Contract `Reason` enum → SDK reason code. Index 0 (None) never appears in a `Skipped` event. */
const REASONS: readonly (PreflightReasonCode | null)[] = [
  null,
  'BLOCKLIST',
  'ZERO_ADDRESS',
  'PRECOMPILE',
  'BURN_FORBIDDEN',
  'UNKNOWN',
]

/**
 * Screens every payee and builds the `payMany` transaction.
 *
 * @example
 * ```ts
 * const plan = await runPlanPayout(transport, payer, [{ to, amount }])
 * plan.skip  // [{ to: '0x7099…', reasonCode: 'BLOCKLIST', layer: 'isBlacklisted', … }]
 * await wallet.sendTransaction(plan.tx!)
 * ```
 */
export async function runPlanPayout(
  transport: RpcTransport,
  payer: Address,
  payees: readonly Payee[],
  options: PlanPayoutOptions = {},
): Promise<PayoutPlan> {
  if (payees.length === 0) throw new RangeError('arc-preflight: planPayout needs at least one payee.')
  for (const [i, p] of payees.entries()) {
    if (p.amount <= 0n) throw new RangeError(`arc-preflight: payee ${i} has a non-positive amount.`)
  }

  const { ref = ZERO_REF, includeSkipped = false, address = PREFLIGHT_PAYOUT_ADDRESS, ...preflightOptions } = options

  // Rules the contract enforces before it ever sends. Checked locally so the plan
  // matches the contract even where Arc would not revert (0x01 accepts value and
  // the USDC is simply gone).
  const staticSkip = payees.map((p): PayoutPlanEntry | null => {
    if (p.to.toLowerCase() === ZERO_ADDRESS) {
      return { ...p, safe: false, reasonCode: 'ZERO_ADDRESS', revertReason: 'Zero address not allowed', layer: 'contract' }
    }
    if (isPrecompileAddress(p.to)) {
      return { ...p, safe: false, reasonCode: 'PRECOMPILE', revertReason: 'Precompile destination', layer: 'contract' }
    }
    return null
  })

  const toCheck = payees.filter((_, i) => !staticSkip[i])
  const { results } = toCheck.length
    ? await runPreflightMany(payer, toCheck.map((p) => p.to), transport, preflightOptions)
    : { results: [] }

  let k = 0
  const entries = payees.map((p, i): PayoutPlanEntry => {
    const s = staticSkip[i]
    if (s) return s
    const r = results[k++]
    return { ...p, safe: r.safe, reasonCode: r.reasonCode, revertReason: r.revertReason, layer: r.layer }
  })

  const pay = entries.filter((e) => e.safe)
  const skip = entries.filter((e) => !e.safe)
  const sum = (xs: PayoutPlanEntry[]) => xs.reduce((a, e) => a + e.amount, 0n)
  const inTx = includeSkipped ? entries : pay

  return {
    entries,
    pay,
    skip,
    payValue: sum(pay),
    skipValue: sum(skip),
    tx: pay.length === 0
      ? null
      : {
          to: address,
          value: sum(inTx),
          data: encodeFunctionData({
            abi: PREFLIGHT_PAYOUT_ABI,
            functionName: 'payMany',
            args: [inTx.map((e) => e.to), inTx.map((e) => e.amount), ref],
          }),
        },
  }
}

export type PayoutReceipt = {
  ref: Hex | null
  paid: { payee: Address; amount: bigint }[]
  skipped: { payee: Address; amount: bigint; reasonCode: PreflightReasonCode; detail: string }[]
  paidValue: bigint
  refundedValue: bigint
}

/**
 * Decodes PreflightPayout events from a receipt's logs (viem or ethers shape).
 * Logs from other contracts are ignored.
 */
export function parsePayoutLogs(
  logs: readonly { address: string; topics: readonly string[]; data: string }[],
  address: Address = PREFLIGHT_PAYOUT_ADDRESS,
): PayoutReceipt {
  const out: PayoutReceipt = { ref: null, paid: [], skipped: [], paidValue: 0n, refundedValue: 0n }
  for (const log of logs) {
    if (log.address.toLowerCase() !== address.toLowerCase()) continue
    const ev = decodePayoutLog(log)
    if (!ev) continue
    out.ref = ev.args.ref
    if (ev.eventName === 'Paid') {
      out.paid.push({ payee: ev.args.payee, amount: ev.args.amount })
      out.paidValue += ev.args.amount
    } else if (ev.eventName === 'Skipped') {
      out.skipped.push({
        payee: ev.args.payee,
        amount: ev.args.amount,
        reasonCode: REASONS[ev.args.reason] ?? 'UNKNOWN',
        detail: ev.args.detail,
      })
      out.refundedValue += ev.args.amount
    }
  }
  return out
}

function decodePayoutLog(log: { topics: readonly string[]; data: string }) {
  if (log.topics.length === 0) return null
  try {
    return decodeEventLog({
      abi: PREFLIGHT_PAYOUT_ABI,
      topics: log.topics as [Hex, ...Hex[]],
      data: log.data as Hex,
    })
  } catch {
    return null
  }
}

export type PayoutStats = {
  batches: bigint
  paidCount: bigint
  skippedCount: bigint
  /** Native USDC wei delivered to payees. */
  paidValue: bigint
  /** Native USDC wei refunded instead of being lost to a revert. */
  protectedValue: bigint
}

/** Lifetime counters from the contract; `null` if it is not deployed on this network. */
export async function fetchPayoutStats(
  transport: RpcTransport,
  address: Address = PREFLIGHT_PAYOUT_ADDRESS,
): Promise<PayoutStats | null> {
  const data = encodeFunctionData({ abi: PREFLIGHT_PAYOUT_ABI, functionName: 'stats' })
  const result = await transport.request({ method: 'eth_call', params: [{ to: address, data }, 'latest'] })
  if (typeof result !== 'string' || result === '0x') return null
  const [batches, paidCount, skippedCount, paidValue, protectedValue] = decodeFunctionResult({
    abi: PREFLIGHT_PAYOUT_ABI,
    functionName: 'stats',
    data: result as Hex,
  })
  return { batches, paidCount, skippedCount, paidValue, protectedValue }
}
