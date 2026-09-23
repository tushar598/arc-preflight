/**
 * probe.ts
 *
 * Core preflight engine for the arc-preflight SDK, shared by the viem and
 * ethers adapters via the minimal `RpcTransport` interface.
 *
 * How it works:
 *   Arc enforces its runtime blocklist check on the NATIVE value transfer path.
 *   When a native send hits a blocklisted address, Arc reverts the call at the
 *   protocol level before any EVM execution. This fires during eth_call too —
 *   meaning we can detect the revert WITHOUT submitting a transaction.
 *
 * Layers (evaluated in order, short-circuit on first BLOCKLIST proof):
 *   1. sanctions     — embedded OFAC SDN snapshot, offline, zero latency
 *   2. cache         — optional local event cache of USDC Blacklisted events
 *   3. isBlacklisted — `USDC.isBlacklisted(addr)` via eth_call (skipped if absent)
 *   4. simulation    — eth_call of a native send with stateOverride; ground truth
 *                      for zero-address, precompile and burn rules too.
 *
 * IMPORTANT: Do NOT use the ERC-20 `transfer()` function for the simulation.
 *   The ERC-20 path checks balance BEFORE the blocklist, so a zero-balance
 *   sender gets "ERC20: transfer amount exceeds balance" — not the blocklist
 *   revert. The native send path always reaches the blocklist check regardless
 *   of balance (we give the sender a virtual balance via stateOverride).
 *
 * Sources:
 *   - https://docs.arc.io/arc/references/evm-differences#value-transfer-rules
 */

import { encodeFunctionData, type Address, type Hex } from 'viem'
import type {
  PreflightResult,
  PreflightOptions,
  RpcTransport,
  TransferIntent,
  PreflightLayer,
} from './types.js'
import { USDC_ADDRESS, USDC_BLACKLIST_ABI, USDC_TRANSFER_GAS_ESTIMATE } from './constants.js'
import { extractRevertReason, classifyRevert } from './revert.js'
import { checkSanctions } from './sanctions.js'
import { decodeTransferIntents } from './calldata.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Virtual balance granted to the sender during simulation: 1,000,000 USDC (18 decimals). */
const VIRTUAL_BALANCE_HEX = '0x' + (10n ** 24n).toString(16)

const toHex = (n: bigint): Hex => `0x${n.toString(16)}`

function looksLikeStateOverrideRejection(err: unknown): boolean {
  const s = String(
    (err as { message?: string })?.message ?? (err as { details?: string })?.details ?? err,
  ).toLowerCase()
  return (
    s.includes('stateoverride') ||
    s.includes('state override') ||
    s.includes('too many arguments') ||
    s.includes('invalid argument 2') ||
    s.includes('method not found') ||
    s.includes('unsupported')
  )
}

function blocked(
  revertReason: string,
  layer: PreflightLayer,
  recipientsChecked: Address[],
  code: PreflightResult['reasonCode'] = 'BLOCKLIST',
): PreflightResult {
  return {
    safe: false,
    revertReason,
    reasonCode: code,
    gasEstimate: USDC_TRANSFER_GAS_ESTIMATE,
    layer,
    recipientsChecked,
  }
}

// ---------------------------------------------------------------------------
// Layer 3 — USDC.isBlacklisted()
// ---------------------------------------------------------------------------

/**
 * Calls `USDC.isBlacklisted(address)`. Returns `null` (not `false`) when the
 * call itself fails, so the caller can distinguish "not blocked" from
 * "could not check" and degrade gracefully.
 */
export async function isBlacklisted(
  transport: RpcTransport,
  address: Address,
): Promise<boolean | null> {
  try {
    const data = encodeFunctionData({
      abi: USDC_BLACKLIST_ABI,
      functionName: 'isBlacklisted',
      args: [address],
    })
    const result = await transport.request({
      method: 'eth_call',
      params: [{ to: USDC_ADDRESS, data }, 'latest'],
    })
    if (typeof result !== 'string' || !result.startsWith('0x') || result.length < 66) return null
    return BigInt(result) === 1n
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Layer 4 — native value simulation
// ---------------------------------------------------------------------------

type SimulationOutcome =
  | { reverted: false }
  | { reverted: true; reason: string }

/**
 * Simulates a native USDC send of `value` wei from `sender` to `recipient`
 * with a virtual sender balance. Falls back to a plain eth_call when the RPC
 * rejects the stateOverride parameter. `data` is only passed for calls that
 * must be simulated as-is (PreflightPayout.payMany).
 */
export async function simulateNativeSend(
  transport: RpcTransport,
  sender: Address,
  recipient: Address,
  value: bigint,
  data?: Hex,
): Promise<SimulationOutcome> {
  const tx: Record<string, string> = { from: sender, to: recipient, value: toHex(value) }
  if (data) tx.data = data
  const stateOverride = { [sender]: { balance: VIRTUAL_BALANCE_HEX } }

  try {
    await transport.request({ method: 'eth_call', params: [tx, 'latest', stateOverride] })
    return { reverted: false }
  } catch (err) {
    if (!looksLikeStateOverrideRejection(err)) {
      return { reverted: true, reason: extractRevertReason(err) }
    }
  }

  // RPC rejected stateOverride — retry without it.
  try {
    await transport.request({ method: 'eth_call', params: [tx, 'latest'] })
    return { reverted: false }
  } catch (err) {
    return { reverted: true, reason: extractRevertReason(err) }
  }
}

/**
 * Live gas estimate for a native send. Returns `null` on any failure so the
 * caller can substitute the documented fallback constant.
 */
export async function estimateNativeSendGas(
  transport: RpcTransport,
  sender: Address,
  recipient: Address,
  value: bigint,
  data?: Hex,
): Promise<bigint | null> {
  const tx: Record<string, string> = { from: sender, to: recipient, value: toHex(value) }
  if (data) tx.data = data
  const stateOverride = { [sender]: { balance: VIRTUAL_BALANCE_HEX } }

  const parse = (r: unknown): bigint | null =>
    typeof r === 'string' && r.startsWith('0x') ? BigInt(r) : null

  try {
    return parse(await transport.request({ method: 'eth_estimateGas', params: [tx, 'latest', stateOverride] }))
  } catch (err) {
    if (!looksLikeStateOverrideRejection(err)) return null
  }
  try {
    return parse(await transport.request({ method: 'eth_estimateGas', params: [tx] }))
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Layered check for ONE sender → recipient pair
// ---------------------------------------------------------------------------

type PairVerdict =
  | { safe: true }
  | { safe: false; reason: string; layer: PreflightLayer; code: PreflightResult['reasonCode'] }

async function checkPair(
  transport: RpcTransport,
  intent: TransferIntent,
  options: PreflightOptions,
  blacklistMemo: Map<string, Promise<boolean | null>>,
): Promise<PairVerdict> {
  const { from, to } = intent

  // (a) sanctions — offline
  const sanctionedSide = checkSanctions(to) ? to : checkSanctions(from) ? from : null
  if (sanctionedSide) {
    return {
      safe: false,
      reason: `Blocked address (OFAC SDN: ${sanctionedSide})`,
      layer: 'sanctions',
      code: 'BLOCKLIST',
    }
  }

  // (b) local event cache — offline
  if (options.cache?.has(to) || options.cache?.has(from)) {
    return { safe: false, reason: 'Blocked address (cached)', layer: 'cache', code: 'BLOCKLIST' }
  }

  // (c) USDC.isBlacklisted() — one eth_call per side, memoised per run
  const ask = (a: Address) => {
    const k = a.toLowerCase()
    let p = blacklistMemo.get(k)
    if (!p) {
      p = isBlacklisted(transport, a)
      blacklistMemo.set(k, p)
    }
    return p
  }
  const [toBl, fromBl] = await Promise.all([ask(to), ask(from)])
  const blSide = toBl === true ? to : fromBl === true ? from : null
  if (blSide) {
    return {
      safe: false,
      reason: `Blocked address (USDC.isBlacklisted: ${blSide})`,
      layer: 'isBlacklisted',
      code: 'BLOCKLIST',
    }
  }

  // (d) simulation — ground truth; always runs unless BLOCKLIST already proven.
  // We always simulate the NATIVE path (even for ERC-20 intents) because it is
  // the only path guaranteed to reach the blocklist check regardless of balance.
  // A payout intent is the exception: simulate the real payMany call, which
  // only reverts if the payer is blocked or the batch itself is malformed.
  const sim =
    intent.via === 'payout'
      ? await simulateNativeSend(transport, from, to, intent.value, intent.data)
      : await simulateNativeSend(transport, from, to, intent.via === 'native' && intent.value > 0n ? intent.value : 1n)
  if (sim.reverted) {
    return { safe: false, reason: sim.reason, layer: 'simulation', code: classifyRevert(sim.reason, to) }
  }
  return { safe: true }
}

// ---------------------------------------------------------------------------
// Public core entry points
// ---------------------------------------------------------------------------

/**
 * Runs the layered preflight for a transaction shape `{ from, to, value, data }`.
 * Every sender → recipient pair discovered in the calldata is checked; the
 * first unsafe pair decides the verdict.
 */
export async function runPreflight(
  transport: RpcTransport,
  tx: { from: Address; to: Address; value: bigint; data?: Hex },
  options: PreflightOptions = {},
): Promise<PreflightResult> {
  const intents = decodeTransferIntents({ from: tx.from, to: tx.to, value: tx.value, data: tx.data })

  if (intents.length === 0) {
    throw new RangeError(
      'arc-preflight: nothing to check — simulatedValue must be > 0 unless `data` ' +
        'encodes a transfer. A zero-value send does not trigger Arc\'s blocklist check.',
    )
  }

  const recipientsChecked = Array.from(new Set(intents.map((i) => i.to)))
  const blacklistMemo = new Map<string, Promise<boolean | null>>()

  for (const intent of intents) {
    const verdict = await checkPair(transport, intent, options, blacklistMemo)
    if (!verdict.safe) {
      return blocked(verdict.reason, verdict.layer, recipientsChecked, verdict.code)
    }
  }

  // Everything is safe — get a live gas number for the real tx shape.
  const live = await estimateNativeSendGas(transport, tx.from, tx.to, tx.value, tx.data)

  return {
    safe: true,
    revertReason: null,
    gasEstimate: live ?? USDC_TRANSFER_GAS_ESTIMATE,
    layer: 'simulation',
    recipientsChecked,
  }
}

/**
 * Probes whether a native USDC transfer from `sender` to `recipient` would
 * succeed or revert on Arc. Thin wrapper over `runPreflight` for the common
 * "one sender, one recipient" case.
 *
 * @param sender    - The address initiating the transfer (from)
 * @param recipient - The address receiving the transfer (to)
 * @param transport - An RpcTransport connected to an Arc node
 * @param options   - Optional probe configuration
 */
export async function probe(
  sender: Address,
  recipient: Address,
  transport: RpcTransport,
  options: PreflightOptions = {},
): Promise<PreflightResult> {
  const simulatedValue = options.simulatedValue ?? (options.data ? 0n : 1n)
  if (simulatedValue < 0n) {
    throw new RangeError('arc-preflight: simulatedValue must be >= 0.')
  }
  return runPreflight(
    transport,
    { from: sender, to: recipient, value: simulatedValue, data: options.data },
    options,
  )
}
