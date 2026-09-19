/**
 * adapters/ethers.ts
 *
 * Ethers v6 adapter for arc-preflight.
 *
 * Exports:
 *   - `preflightEthers()` — one-shot preflight check using an ethers JsonRpcProvider
 *   - `withPreflightEthers()` — wraps an ethers Signer with automatic preflight guards
 *
 * Why different names from the Viem adapter?
 *   Both adapters live in the same package entry point. Using different names
 *   (`preflightEthers` / `withPreflightEthers`) avoids a naming collision with
 *   `preflight` / `withPreflight` from the Viem adapter. Callers can import both
 *   from 'arc-preflight' without conflict.
 */

import type { JsonRpcProvider, Signer, TransactionRequest } from 'ethers'
import type { PreflightResult, PreflightOptions } from '../types.js'
import { PreflightError } from '../errors.js'
import { USDC_TRANSFER_GAS_ESTIMATE } from '../constants.js'

// ---------------------------------------------------------------------------
// Revert reason extraction for ethers errors
// ---------------------------------------------------------------------------

function extractRevertReason(err: unknown): string {
  if (err == null) return 'unknown error'

  const e = err as Record<string, unknown>

  // 1. ethers v6 surfaces the underlying node error in error.info.error.message
  //    Arc returns: { code: -32603, message: "Blocked address" }
  const infoMsg =
    (e.info as { error?: { message?: string } } | undefined)?.error?.message
  if (
    infoMsg &&
    typeof infoMsg === 'string' &&
    !infoMsg.toLowerCase().includes('internal error') &&
    !infoMsg.toLowerCase().includes('transaction failed')
  ) {
    return infoMsg.replace(/^revert:\s*/i, '').trim()
  }

  // 2. ethers shortMessage / message
  const shortMessage = e.shortMessage as string | undefined
  if (
    shortMessage &&
    !shortMessage.toLowerCase().includes('transaction failed') &&
    !shortMessage.toLowerCase().includes('an internal error')
  ) {
    return shortMessage
  }

  // 3. Regex from stringified error
  const errStr = String((e.message as string) || err)
  const patterns = [
    /Blocked address/i,
    /runtime-transfer-check/i,
    /reverted(?:\s+with\s+reason)?:\s*(.+?)(?:\.|$)/i,
    /reason:\s*(.+?)(?:\.|$)/i,
  ]
  for (const pattern of patterns) {
    const match = errStr.match(pattern)
    if (match?.[1]) return match[1].trim()
    if (match?.[0]) return match[0]
  }

  return shortMessage || 'execution reverted'
}

// ---------------------------------------------------------------------------
// Core probe (ethers-flavoured)
// ---------------------------------------------------------------------------

async function probeEthers(
  sender: string,
  recipient: string,
  provider: JsonRpcProvider,
  options: PreflightOptions = {},
): Promise<PreflightResult> {
  const simulatedValue = options.simulatedValue ?? 1n

  if (simulatedValue <= 0n) {
    throw new RangeError(
      'arc-preflight: simulatedValue must be > 0. ' +
        'A zero-value send does not trigger Arc\'s blocklist check.',
    )
  }

  // Build the stateOverride: give sender a virtual 10^24 wei balance
  // so the probe can reach Arc's blocklist check without OutOfFunds
  const stateOverride = {
    [sender]: {
      balance: '0x' + (10n ** 24n).toString(16), // 1,000,000 native USDC
    },
  }

  // --- Step 1: Simulate via raw eth_call with stateOverride ---
  try {
    await provider.send('eth_call', [
      {
        from: sender,
        to: recipient,
        value: '0x' + simulatedValue.toString(16),
      },
      'latest',
      stateOverride,
    ])
  } catch (err: unknown) {
    // If stateOverride is rejected by an unsupported RPC, retry without it
    const errStr = String(err).toLowerCase()
    if (
      errStr.includes('stateoverride') ||
      errStr.includes('state override') ||
      errStr.includes('unsupported') ||
      errStr.includes('invalid argument') ||
      errStr.includes('method not found')
    ) {
      try {
        await provider.send('eth_call', [
          {
            from: sender,
            to: recipient,
            value: '0x' + simulatedValue.toString(16),
          },
          'latest',
        ])
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

  // --- Step 2: Transfer is safe — estimate gas ---
  let gasEstimate = USDC_TRANSFER_GAS_ESTIMATE

  try {
    const estimate = await provider.estimateGas({
      from: sender,
      to: recipient,
      value: simulatedValue,
    })
    gasEstimate = BigInt(estimate.toString())
  } catch {
    // Sender has no real balance — use documented fallback
    gasEstimate = USDC_TRANSFER_GAS_ESTIMATE
  }

  return {
    safe: true,
    revertReason: null,
    gasEstimate,
  }
}

// ---------------------------------------------------------------------------
// preflightEthers() — standalone function
// ---------------------------------------------------------------------------

/**
 * Checks whether a native USDC transfer from `sender` to `recipient` would
 * revert on Arc, using an ethers v6 JsonRpcProvider.
 *
 * @example
 * ```ts
 * import { JsonRpcProvider } from 'ethers'
 * import { preflightEthers } from 'arc-preflight'
 *
 * const provider = new JsonRpcProvider('https://rpc.testnet.arc.network')
 * const result = await preflightEthers('0xSender', '0xRecipient', provider)
 *
 * if (!result.safe) {
 *   console.error('Transfer blocked:', result.revertReason)
 * }
 * ```
 *
 * @param sender    - The address initiating the transfer
 * @param recipient - The destination address
 * @param provider  - An ethers v6 JsonRpcProvider connected to an Arc node
 * @param options   - Optional configuration (simulatedValue, etc.)
 */
export async function preflightEthers(
  sender: string,
  recipient: string,
  provider: JsonRpcProvider,
  options?: PreflightOptions,
): Promise<PreflightResult> {
  return probeEthers(sender, recipient, provider, options)
}

// ---------------------------------------------------------------------------
// withPreflightEthers() — Signer proxy
// ---------------------------------------------------------------------------

/**
 * Wraps an ethers v6 Signer with an automatic preflight guard.
 *
 * Every call to `sendTransaction` on the returned signer will first run a
 * preflight check. If the transfer would revert, a `PreflightError` is thrown
 * BEFORE any gas is spent.
 *
 * @example
 * ```ts
 * import { JsonRpcProvider, Wallet } from 'ethers'
 * import { withPreflightEthers, PreflightError } from 'arc-preflight'
 *
 * const provider = new JsonRpcProvider('https://rpc.testnet.arc.network')
 * const signer = new Wallet('0xprivatekey', provider)
 * const guardedSigner = withPreflightEthers(signer, provider)
 *
 * try {
 *   const tx = await guardedSigner.sendTransaction({ to: recipient, value: amount })
 * } catch (err) {
 *   if (err instanceof PreflightError) {
 *     console.log('Blocked before submission:', err.revertReason)
 *   }
 * }
 * ```
 *
 * @param signer   - The ethers v6 Signer to wrap
 * @param provider - A JsonRpcProvider used for the eth_call simulation
 * @param options  - Optional preflight configuration
 */
export function withPreflightEthers<T extends Signer>(
  signer: T,
  provider: JsonRpcProvider,
  options?: PreflightOptions,
): T & { __preflight: true } {
  const guardedSigner = new Proxy(signer, {
    get(target, prop, receiver) {
      if (prop !== 'sendTransaction') {
        return Reflect.get(target, prop, receiver)
      }

      return async (tx: TransactionRequest) => {
        // Determine sender address
        const sender = await target.getAddress()
        const recipient = tx.to as string | undefined

        // Only gate on transfers that have a recipient and non-zero value
        const value =
          tx.value != null ? BigInt(tx.value.toString()) : 0n

        if (sender && recipient && value > 0n) {
          const result = await probeEthers(sender, recipient, provider, {
            simulatedValue: value,
            ...options,
          })

          if (!result.safe) {
            throw new PreflightError(result.revertReason ?? 'execution reverted')
          }
        }

        // Preflight passed — forward to signer
        return target.sendTransaction(tx)
      }
    },
  })

  return Object.assign(guardedSigner, { __preflight: true as const })
}
