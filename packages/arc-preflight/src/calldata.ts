/**
 * calldata.ts
 *
 * Decodes a transaction's calldata into the set of value movements it would
 * cause, so a `value: 0` transaction that moves USDC via the ERC-20 interface,
 * the Memo contract or a Multicall3From batch is still guarded.
 *
 * Handled shapes (all best-effort, never throws):
 *   - ERC-20 `transfer(to, value)`               → { from: tx.from, to }
 *   - ERC-20 `transferFrom(from, to, value)`     → { from, to }
 *   - EIP-3009 `transferWithAuthorization` /
 *     `receiveWithAuthorization` (both variants) → { from, to }
 *   - `Memo.memo(target, data, …)`                → recurse into (target, data)
 *   - `Multicall3From.aggregate / aggregate3 /
 *     tryAggregate / blockAndAggregate /
 *     tryBlockAndAggregate`                       → recurse into each subcall
 *
 * Memo and Multicall3From route through the CallFrom precompile, which
 * preserves the ORIGINAL `msg.sender`, so inner ERC-20 transfers are
 * attributed to `tx.from`, not to the wrapper contract.
 */

import { decodeFunctionData, type Address, type Hex } from 'viem'
import {
  ERC20_TRANSFER_ABI,
  MEMO_ABI,
  MULTICALL3FROM_ABI,
} from './constants.js'
import type { TransferIntent } from './types.js'

const DECODE_ABI = [...ERC20_TRANSFER_ABI, ...MEMO_ABI, ...MULTICALL3FROM_ABI] as const

const MAX_DEPTH = 4

export type TxLike = {
  from: Address
  to?: Address | null
  value?: bigint | null
  data?: Hex | null
}

/**
 * Extracts every sender → recipient movement a transaction would perform.
 *
 * The top-level native value transfer (when `value > 0`) is always first.
 * Decoding failures are swallowed — unknown calldata simply yields no
 * additional intents.
 */
export function decodeTransferIntents(tx: TxLike): TransferIntent[] {
  const out: TransferIntent[] = []
  const to = tx.to ?? undefined
  const value = tx.value ?? 0n

  if (to && value > 0n) {
    out.push({ from: tx.from, to, value, via: 'native' })
  }

  if (to && tx.data && tx.data.length >= 10) {
    walk(tx.from, to, tx.data, out, 0)
  }

  return dedupe(out)
}

function walk(
  sender: Address,
  target: Address,
  data: Hex,
  out: TransferIntent[],
  depth: number,
  via: TransferIntent['via'] = 'erc20',
): void {
  if (depth > MAX_DEPTH) return

  let decoded: ReturnType<typeof decodeFunctionData<typeof DECODE_ABI>>
  try {
    decoded = decodeFunctionData({ abi: DECODE_ABI, data })
  } catch {
    return
  }

  switch (decoded.functionName) {
    case 'transfer': {
      const [to, amount] = decoded.args
      out.push({ from: sender, to, value: amount, via })
      return
    }
    case 'transferFrom': {
      const [from, to, amount] = decoded.args
      out.push({ from, to, value: amount, via })
      return
    }
    case 'transferWithAuthorization':
    case 'receiveWithAuthorization': {
      const [from, to, amount] = decoded.args
      out.push({ from, to, value: amount, via })
      return
    }
    case 'memo': {
      const [innerTarget, innerData] = decoded.args
      walk(sender, innerTarget, innerData, out, depth + 1, 'memo')
      return
    }
    case 'aggregate':
    case 'blockAndAggregate': {
      const [calls] = decoded.args
      for (const c of calls) walk(sender, c.target, c.callData, out, depth + 1, 'multicall3from')
      return
    }
    case 'aggregate3': {
      const [calls] = decoded.args
      for (const c of calls) walk(sender, c.target, c.callData, out, depth + 1, 'multicall3from')
      return
    }
    case 'tryAggregate':
    case 'tryBlockAndAggregate': {
      const [, calls] = decoded.args
      for (const c of calls) walk(sender, c.target, c.callData, out, depth + 1, 'multicall3from')
      return
    }
    default:
      return
  }
}

function dedupe(intents: TransferIntent[]): TransferIntent[] {
  const seen = new Set<string>()
  const result: TransferIntent[] = []
  for (const i of intents) {
    const key = `${i.from.toLowerCase()}>${i.to.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(i)
  }
  return result
}
