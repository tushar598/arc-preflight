/**
 * probe.ts
 *
 * Core preflight probe for the arc-preflight SDK.
 *
 * How it works:
 *   Arc enforces its runtime blocklist check on the NATIVE value transfer path.
 *   When a native send hits a blocklisted address, Arc reverts the call at the
 *   protocol level before any EVM execution. This fires during eth_call too —
 *   meaning we can detect the revert WITHOUT submitting a transaction.
 *
 *   This module simulates a native USDC send of `simulatedValue` wei (default: 1n)
 *   using `client.call()`. If the call reverts, the transfer would revert on-chain.
 *
 * IMPORTANT: Do NOT use the ERC-20 `transfer()` function for this probe.
 *   The ERC-20 path checks balance BEFORE the blocklist, so a zero-balance
 *   sender will get "ERC20: transfer amount exceeds balance" — not the blocklist
 *   revert. The native send path always reaches the blocklist check regardless
 *   of balance.
 *
 * Sources:
 *   - https://docs.arc.network/arc/references/evm-differences#value-transfer-rules
 */

import type { Address, PublicClient } from 'viem'
import type { PreflightResult, PreflightOptions } from './types.js'
import { USDC_TRANSFER_GAS_ESTIMATE } from './constants.js'

// ---------------------------------------------------------------------------
// Revert reason extraction helpers
// ---------------------------------------------------------------------------

/**
 * Extracts a human-readable revert reason from a Viem call error.
 *
 * Viem surfaces error information in multiple ways depending on the RPC
 * implementation. We try each source in order of reliability:
 *
 * 1. `shortMessage` — Viem's cleaned-up one-liner (most reliable)
 * 2. ABI-decoded `Error(string)` from `cause.data` (0x08c379a0 prefix)
 * 3. Regex extraction from the raw error message string
 * 4. Fallback generic string
 */
function extractRevertReason(err: unknown): string {
  if (err == null) return 'unknown error'

  // 1. Try to ABI-decode from cause.data (Error(string) = 0x08c379a0...)
  const causeData: string | undefined =
    (err as { cause?: { data?: string } })?.cause?.data ??
    (err as { data?: string })?.data

  if (causeData?.startsWith('0x08c379a0')) {
    // Error(string) ABI encoding: 4-byte selector + 32-byte offset + 32-byte length + string
    try {
      // Skip the 4-byte selector (8 hex chars after "0x"), then decode the UTF-8 string
      const hex = causeData.slice(10) // remove '0x' + 4-byte selector
      const offsetHex = hex.slice(0, 64)
      const offset = parseInt(offsetHex, 16) * 2 // in nibbles
      const lengthHex = hex.slice(offset, offset + 64)
      const length = parseInt(lengthHex, 16)
      const strHex = hex.slice(offset + 64, offset + 64 + length * 2)
      const decoded = Buffer.from(strHex, 'hex').toString('utf8')
      if (decoded) return decoded
    } catch {
      // Manual decode failed — fall through
    }
  }

  // 2. Node-level details (e.g. Arc node returns "Blocked address" in details)
  const details =
    (err as { details?: string })?.details ??
    (err as { cause?: { details?: string } })?.cause?.details
  if (details && typeof details === 'string') {
    const cleaned = details.replace(/^revert:\s*/i, '').trim()
    if (
      cleaned &&
      !cleaned.toLowerCase().includes('transaction creation failed') &&
      !cleaned.toLowerCase().includes('an internal error was received')
    ) {
      return cleaned
    }
  }

  // 3. Regex extraction from the full error message string
  const errStr = String((err as { message?: string })?.message || err)
  const patterns = [
    /Blocked address/i,
    /runtime-transfer-check/i,
    /reverted(?:\s+with\s+reason)?:\s*(.+?)(?:\.|$)/i,
    /Revert:\s*(.+?)(?:\.|$)/i,
    /reason:\s*(.+?)(?:\.|$)/i,
  ]
  for (const pattern of patterns) {
    const match = errStr.match(pattern)
    if (match?.[1]) return match[1].trim()
    if (match?.[0]) return match[0]
  }

  // 4. Viem's shortMessage (if not a generic wrapper string)
  const shortMessage = (err as { shortMessage?: string }).shortMessage
  if (
    shortMessage &&
    !shortMessage.toLowerCase().includes('transaction creation failed') &&
    !shortMessage.toLowerCase().includes('an internal error was received')
  ) {
    return shortMessage
  }

  // 5. Generic fallback
  return shortMessage || 'execution reverted'
}

// ---------------------------------------------------------------------------
// Main probe function
// ---------------------------------------------------------------------------

/**
 * Probes whether a native USDC transfer from `sender` to `recipient` would
 * succeed or revert on Arc, using `eth_call` simulation.
 *
 * This is the core engine of the arc-preflight SDK. It should not be called
 * directly by most consumers — use the `preflight()` function exported from
 * the Viem adapter instead.
 *
 * @param sender    - The address initiating the transfer (from)
 * @param recipient - The address receiving the transfer (to)
 * @param client    - A Viem PublicClient connected to an Arc node
 * @param options   - Optional probe configuration
 * @returns PreflightResult with safe flag, revert reason, and gas estimate
 */
export async function probe(
  sender: Address,
  recipient: Address,
  client: PublicClient,
  options: PreflightOptions = {},
): Promise<PreflightResult> {
  const simulatedValue = options.simulatedValue ?? 1n

  if (simulatedValue <= 0n) {
    throw new RangeError(
      'arc-preflight: simulatedValue must be > 0. ' +
        'A zero-value send does not trigger Arc\'s blocklist check.',
    )
  }

  // --- Step 1: Simulate a native USDC send via eth_call ---
  // Arc's runtime-transfer-check fires on any native value transfer to/from
  // a blocklisted address. We provide virtual balance via stateOverride so
  // simulation can check recipient validity without being stopped by OutOfFunds.
  try {
    await client.call({
      account: sender,
      to: recipient,
      value: simulatedValue,
      stateOverride: [
        {
          address: sender,
          balance: 10n ** 24n, // 1,000,000 native USDC (18 decimals)
        },
      ],
    })
  } catch (err: unknown) {
    // If stateOverride is rejected by an RPC that does not support it,
    // retry without stateOverride
    const errStr = String(err).toLowerCase()
    if (
      errStr.includes('stateoverride') ||
      errStr.includes('state override') ||
      errStr.includes('method not found')
    ) {
      try {
        await client.call({
          account: sender,
          to: recipient,
          value: simulatedValue,
        })
      } catch (retryErr: unknown) {
        return {
          safe: false,
          revertReason: extractRevertReason(retryErr),
          gasEstimate: USDC_TRANSFER_GAS_ESTIMATE,
        }
      }
    } else {
      return {
        safe: false,
        revertReason: extractRevertReason(err),
        gasEstimate: USDC_TRANSFER_GAS_ESTIMATE,
      }
    }
  }

  // --- Step 2: Transfer looks safe — estimate gas for the real call ---
  let gasEstimate = USDC_TRANSFER_GAS_ESTIMATE

  try {
    gasEstimate = await client.estimateGas({
      account: sender,
      to: recipient,
      value: simulatedValue,
    })
  } catch {
    // estimateGas failed (e.g., sender has no balance) — use documented fallback
    // This doesn't affect the safety determination; the call itself succeeded.
    gasEstimate = USDC_TRANSFER_GAS_ESTIMATE
  }

  return {
    safe: true,
    revertReason: null,
    gasEstimate,
  }
}
