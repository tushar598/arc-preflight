/**
 * adapters/viem.ts
 *
 * Viem adapter for arc-preflight.
 *
 * Exports:
 *   - `preflight()`      — one-shot preflight check for a single transfer
 *   - `preflightMany()`  — one sender, many recipients
 *   - `withPreflight()`  — wraps a WalletClient with automatic preflight guards
 */

import type {
  Address,
  PublicClient,
  WalletClient,
  SendTransactionParameters,
  Hash,
  Hex,
} from 'viem'
import { probe, runPreflight } from '../probe.js'
import { runPreflightMany, type PreflightManyOptions } from '../batch.js'
import { transportFromViem } from '../transport.js'
import { PreflightError } from '../errors.js'
import type { PreflightResult, PreflightOptions, PreflightManyResult } from '../types.js'

// ---------------------------------------------------------------------------
// preflight() — standalone function
// ---------------------------------------------------------------------------

/**
 * Checks whether a native USDC transfer from `sender` to `recipient` would
 * revert on Arc before submitting anything to the chain.
 *
 * Runs four layers — OFAC snapshot, local cache, `USDC.isBlacklisted()`, and
 * an `eth_call` simulation of the native send — and reports which one fired.
 *
 * @example
 * ```ts
 * import { createPublicClient, http } from 'viem'
 * import { preflight, ARC_MAINNET_RPC_URL } from 'arc-preflight'
 *
 * const client = createPublicClient({ transport: http(ARC_MAINNET_RPC_URL) })
 * const result = await preflight('0xYourSender', '0xRecipient', client)
 *
 * if (!result.safe) {
 *   console.error(`Blocked [${result.reasonCode}] via ${result.layer}:`, result.revertReason)
 * }
 * ```
 *
 * @param sender    - The address initiating the transfer
 * @param recipient - The destination address
 * @param client    - A Viem PublicClient connected to an Arc node
 * @param options   - Optional configuration (simulatedValue, cache, data)
 */
export async function preflight(
  sender: Address,
  recipient: Address,
  client: PublicClient,
  options?: PreflightOptions,
): Promise<PreflightResult> {
  return probe(sender, recipient, transportFromViem(client), options)
}

/**
 * Checks one sender against many recipients with bounded concurrency.
 *
 * @example
 * ```ts
 * const { results, blockedCount } = await preflightMany(agent, payees, client)
 * ```
 */
export async function preflightMany(
  sender: Address,
  recipients: readonly Address[],
  client: PublicClient,
  options?: PreflightManyOptions,
): Promise<PreflightManyResult> {
  return runPreflightMany(sender, recipients, transportFromViem(client), options)
}

// ---------------------------------------------------------------------------
// withPreflight() — WalletClient proxy
// ---------------------------------------------------------------------------

/**
 * Wraps a Viem WalletClient with an automatic preflight guard.
 *
 * Every call to `sendTransaction` on the returned client first runs the
 * layered preflight against the transaction's native value AND any transfers
 * encoded in its calldata (ERC-20 `transfer`, Memo, Multicall3From). If the
 * transfer would revert, a `PreflightError` is thrown BEFORE any gas is spent.
 *
 * A transaction with `value: 0` and calldata the SDK cannot decode is passed
 * through unchecked — there is nothing for the blocklist to act on.
 *
 * @example
 * ```ts
 * const guardedClient = withPreflight(walletClient, publicClient)
 *
 * try {
 *   const hash = await guardedClient.sendTransaction({ to: recipient, value: amount })
 * } catch (err) {
 *   if (err instanceof PreflightError) {
 *     console.log('Blocked before submission:', err.reasonCode, err.revertReason)
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
  const transport = transportFromViem(publicClient)

  const guardedClient = new Proxy(walletClient, {
    get(target, prop, receiver) {
      if (prop === '__preflight') return true
      if (prop !== 'sendTransaction') {
        return Reflect.get(target, prop, receiver)
      }

      return async (params: SendTransactionParameters): Promise<Hash> => {
        const account = params.account ?? walletClient.account
        const sender: Address | undefined =
          typeof account === 'string'
            ? account
            : (account as { address?: Address })?.address

        const recipient = params.to ?? undefined
        const value = params.value ?? 0n
        const data = (params.data ?? undefined) as Hex | undefined

        if (sender && recipient && (value > 0n || data)) {
          let result: PreflightResult | null = null
          try {
            result = await runPreflight(
              transport,
              { from: sender, to: recipient, value, data },
              { ...options, data },
            )
          } catch (err) {
            // Nothing decodable to check (value 0 + unknown calldata) — pass through.
            if (!(err instanceof RangeError)) throw err
          }

          if (result && !result.safe) {
            throw new PreflightError(result.revertReason ?? 'execution reverted', result)
          }
        }

        return target.sendTransaction(params)
      }
    },
  })

  return guardedClient as WalletClient & { __preflight: true }
}
