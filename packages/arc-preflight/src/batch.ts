/**
 * batch.ts
 *
 * `preflightMany()` — check one sender against many recipients with a small
 * concurrency limit, sharing one cache / one transport.
 */

import type { Address } from 'viem'
import type { PreflightManyResult, PreflightOptions, PreflightResult, RpcTransport } from './types.js'
import { probe } from './probe.js'

export type PreflightManyOptions = PreflightOptions & {
  /** Max in-flight checks. Default 5. */
  concurrency?: number
}

export async function runPreflightMany(
  sender: Address,
  recipients: readonly Address[],
  transport: RpcTransport,
  options: PreflightManyOptions = {},
): Promise<PreflightManyResult> {
  const concurrency = Math.max(1, options.concurrency ?? 5)
  const results: PreflightResult[] = new Array(recipients.length)
  let next = 0

  const worker = async () => {
    while (next < recipients.length) {
      const i = next++
      try {
        results[i] = await probe(sender, recipients[i], transport, options)
      } catch (err) {
        results[i] = {
          safe: false,
          revertReason: err instanceof Error ? err.message : String(err),
          reasonCode: 'UNKNOWN',
          gasEstimate: 0n,
          recipientsChecked: [recipients[i]],
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, recipients.length) }, worker))

  const safeCount = results.filter((r) => r.safe).length
  return { results, safeCount, blockedCount: results.length - safeCount }
}
