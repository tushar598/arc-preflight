/**
 * adapters/viem.ts
 *
 * Viem adapter for arc-preflight.
 *
 * Exports:
 *   - `preflight()` — one-shot preflight check for a single transfer
 *   - `withPreflight()` — wraps a WalletClient with automatic preflight guards
 */

import type {
  Address,
  PublicClient,
  WalletClient,
  SendTransactionParameters,
  Hash,
} from 'viem'
import { probe } from '../probe.js'
import { PreflightError } from '../errors.js'
import type { PreflightResult, PreflightOptions } from '../types.js'

// ---------------------------------------------------------------------------
// preflight() — standalone function
// ---------------------------------------------------------------------------

/**
 * Checks whether a native USDC transfer from `sender` to `recipient` would
 * revert on Arc before submitting anything to the chain.
 *
 * Uses Arc's own runtime via `eth_call` — any address that is blocklisted
 * will cause the simulated call to revert, and you get the exact revert reason.
 *
 * @example
 * ```ts
 * import { createPublicClient, http } from 'viem'
 * import { preflight } from 'arc-preflight'
 *
 * const client = createPublicClient({ transport: http('https://rpc.testnet.arc.network') })
 *
 * const result = await preflight(
 *   '0xYourSender',
 *   '0xRecipient',
 *   client,
 * )
 *
 * if (!result.safe) {
 *   console.error('Transfer blocked:', result.revertReason)
 * }
 * ```
 *
 * @param sender    - The address initiating the transfer
 * @param recipient - The destination address
 * @param client    - A Viem PublicClient connected to an Arc node
 * @param options   - Optional configuration (simulatedValue, etc.)
 */
export async function preflight(
  sender: Address,
  recipient: Address,
  client: PublicClient,
  options?: PreflightOptions,
): Promise<PreflightResult> {
  return probe(sender, recipient, client, options)
}

// ---------------------------------------------------------------------------
// withPreflight() — WalletClient proxy
// ---------------------------------------------------------------------------

/**
 * Wraps a Viem WalletClient with an automatic preflight guard.
 *
 * Every call to `sendTransaction` on the returned client will first run a
 * preflight check. If the transfer would revert, a `PreflightError` is thrown
 * BEFORE any gas is spent.
 *
 * @example
 * ```ts
 * import { createWalletClient, createPublicClient, http } from 'viem'
 * import { withPreflight, PreflightError } from 'arc-preflight'
 *
 * const walletClient = createWalletClient({ ... })
 * const publicClient = createPublicClient({ ... })
 *
 * const guardedClient = withPreflight(walletClient, publicClient)
 *
 * try {
 *   const hash = await guardedClient.sendTransaction({ to: recipient, value: amount })
 * } catch (err) {
 *   if (err instanceof PreflightError) {
 *     console.log('Blocked before submission:', err.revertReason)
 *   }
 * }
 * ```
 *
 * @param walletClient - The Viem WalletClient to wrap
 * @param publicClient - A Viem PublicClient used for the eth_call simulation
 * @param options      - Optional preflight configuration
 * @returns A proxy object with the same interface as WalletClient, but with
 *          preflight guards on `sendTransaction`
 */
export function withPreflight(
  walletClient: WalletClient,
  publicClient: PublicClient,
  options?: PreflightOptions,
): WalletClient & { __preflight: true } {
  const guardedClient = new Proxy(walletClient, {
    get(target, prop, receiver) {
      if (prop !== 'sendTransaction') {
        return Reflect.get(target, prop, receiver)
      }

      // Return a wrapped sendTransaction that runs preflight first
      return async (params: SendTransactionParameters): Promise<Hash> => {
        // Determine sender — prefer params.account, fall back to walletClient.account
        const account = params.account ?? walletClient.account
        const sender: Address | undefined =
          typeof account === 'string'
            ? account
            : (account as { address?: Address })?.address

        // Determine recipient (to)
        const recipient = params.to

        // Only gate on transfers that have a recipient and sender
        if (sender && recipient && (params.value ?? 0n) > 0n) {
          const result = await probe(
            sender,
            recipient,
            publicClient,
            {
              simulatedValue: params.value ?? 1n,
              ...options,
            },
          )

          if (!result.safe) {
            throw new PreflightError(result.revertReason ?? 'execution reverted')
          }
        }

        // Preflight passed (or skipped for zero-value sends) — forward to wallet
        return target.sendTransaction(params)
      }
    },
  })

  // Tag the proxy so callers can detect it
  return Object.assign(guardedClient, { __preflight: true as const })
}
