/**
 * adapters/ethers.ts
 *
 * Ethers v6 adapter for arc-preflight. Shares the exact same probe engine as
 * the viem adapter via `RpcTransport`.
 *
 * Exports:
 *   - `preflightEthers()`     — one-shot preflight check using an ethers JsonRpcProvider
 *   - `preflightManyEthers()` — one sender, many recipients
 *   - `withPreflightEthers()` — wraps an ethers Signer with automatic preflight guards
 *   - `planPayoutEthers()`    — screen payees and build a PreflightPayout `payMany` tx
 *   - `readPayoutStatsEthers()` — PreflightPayout's lifetime counters
 *
 * Why different names from the Viem adapter?
 *   Both adapters live in the same package entry point. Using different names
 *   avoids a naming collision so callers can import both without conflict.
 */

import type { JsonRpcProvider, Signer, TransactionRequest } from 'ethers'
import type { Address, Hex } from 'viem'
import type { PreflightResult, PreflightOptions, PreflightManyResult } from '../types.js'
import { probe, runPreflight } from '../probe.js'
import { runPreflightMany, type PreflightManyOptions } from '../batch.js'
import { transportFromEthers } from '../transport.js'
import { PreflightError } from '../errors.js'
import { runPlanPayout, fetchPayoutStats, type Payee, type PayoutPlan, type PayoutStats, type PlanPayoutOptions } from '../payout.js'

type EthersProviderLike = Pick<JsonRpcProvider, 'send'>

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
 * import { preflightEthers, ARC_MAINNET_RPC_URL } from 'arc-preflight'
 *
 * const provider = new JsonRpcProvider(ARC_MAINNET_RPC_URL)
 * const result = await preflightEthers('0xSender', '0xRecipient', provider)
 * ```
 */
export async function preflightEthers(
  sender: string,
  recipient: string,
  provider: EthersProviderLike,
  options?: PreflightOptions,
): Promise<PreflightResult> {
  return probe(sender as Address, recipient as Address, transportFromEthers(provider), options)
}

/** Ethers flavour of `preflightMany()`. */
export async function preflightManyEthers(
  sender: string,
  recipients: readonly string[],
  provider: EthersProviderLike,
  options?: PreflightManyOptions,
): Promise<PreflightManyResult> {
  return runPreflightMany(
    sender as Address,
    recipients as readonly Address[],
    transportFromEthers(provider),
    options,
  )
}

// ---------------------------------------------------------------------------
// withPreflightEthers() — Signer proxy
// ---------------------------------------------------------------------------

/**
 * Wraps an ethers v6 Signer with an automatic preflight guard.
 *
 * Every call to `sendTransaction` on the returned signer first runs the
 * layered preflight against the transaction's native value AND any transfers
 * encoded in its calldata. If the transfer would revert, a `PreflightError`
 * is thrown BEFORE any gas is spent.
 *
 * @example
 * ```ts
 * const guardedSigner = withPreflightEthers(signer, provider)
 * try {
 *   await guardedSigner.sendTransaction({ to: recipient, value: amount })
 * } catch (err) {
 *   if (err instanceof PreflightError) console.log(err.reasonCode, err.revertReason)
 * }
 * ```
 */
export function withPreflightEthers<T extends Signer>(
  signer: T,
  provider: EthersProviderLike,
  options?: PreflightOptions,
): T & { __preflight: true } {
  const transport = transportFromEthers(provider)

  const guardedSigner = new Proxy(signer, {
    get(target, prop, receiver) {
      if (prop === '__preflight') return true
      if (prop !== 'sendTransaction') {
        return Reflect.get(target, prop, receiver)
      }

      return async (tx: TransactionRequest) => {
        const sender = (await target.getAddress()) as Address
        const recipient = (typeof tx.to === 'string' ? tx.to : undefined) as Address | undefined
        const value = tx.value != null ? BigInt(tx.value.toString()) : 0n
        const data = (typeof tx.data === 'string' && tx.data !== '0x' ? tx.data : undefined) as
          | Hex
          | undefined

        if (sender && recipient && (value > 0n || data)) {
          let result: PreflightResult | null = null
          try {
            result = await runPreflight(
              transport,
              { from: sender, to: recipient, value, data },
              { ...options, data },
            )
          } catch (err) {
            if (!(err instanceof RangeError)) throw err
          }

          if (result && !result.safe) {
            throw new PreflightError(result.revertReason ?? 'execution reverted', result)
          }
        }

        return target.sendTransaction(tx)
      }
    },
  })

  return guardedSigner as T & { __preflight: true }
}

// ---------------------------------------------------------------------------
// PreflightPayout
// ---------------------------------------------------------------------------

/** Ethers flavour of `planPayout()`. */
export async function planPayoutEthers(
  payer: string,
  payees: readonly Payee[],
  provider: EthersProviderLike,
  options?: PlanPayoutOptions,
): Promise<PayoutPlan> {
  return runPlanPayout(transportFromEthers(provider), payer as Address, payees, options)
}

/** Ethers flavour of `readPayoutStats()`. */
export async function readPayoutStatsEthers(
  provider: EthersProviderLike,
  address?: string,
): Promise<PayoutStats | null> {
  return fetchPayoutStats(transportFromEthers(provider), address as Address | undefined)
}
