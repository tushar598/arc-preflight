/**
 * fakeArc.ts
 *
 * An in-memory JSON-RPC that mimics the parts of Arc's runtime that
 * arc-preflight depends on, with error shapes copied from the real public RPC:
 *
 *   native send → blocked        { code: -32603, message: "Blocked address" }
 *   native send → zero address   { code: 3, message: "execution reverted: Zero address not allowed", data: Error(string) }
 *   native send → 0x1800…0001    { code: 3, message: "execution reverted: Input too short", data: Error(string) }
 *   USDC.isBlacklisted(addr)     0x…01 / 0x…00
 *   eth_estimateGas              0x5208 (21000) for a plain send, 0xc0ba (49338) with calldata
 */

import { encodeErrorResult, type Address } from 'viem'
import type { RpcTransport } from '../../src/index.js'

export const SENDER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const
export const CLEAN = '0x1111111111111111111111111111111111111111' as const
export const CLEAN2 = '0x2222222222222222222222222222222222222222' as const
export const BLOCKED = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const
export const ZERO = '0x0000000000000000000000000000000000000000' as const
export const ARC_PRECOMPILE = '0x1800000000000000000000000000000000000001' as const
export const USDC = '0x3600000000000000000000000000000000000000' as const
const IS_BLACKLISTED_SELECTOR = '0xfe575a87'

export type RpcCall = { method: string; params: unknown[] }

export type FakeArcOptions = {
  /** Addresses the runtime blocks on the native path. */
  blocked?: readonly string[]
  /** Addresses `USDC.isBlacklisted()` reports as true. Defaults to `blocked`. */
  blacklisted?: readonly string[]
  /** Throw "too many arguments" when stateOverride is passed. */
  rejectStateOverride?: boolean
  /** Make `USDC.isBlacklisted()` revert (simulates a chain without the method). */
  noIsBlacklisted?: boolean
  /** Make every eth_estimateGas fail. */
  failEstimateGas?: boolean
}

const errorString = (msg: string) =>
  encodeErrorResult({ abi: [{ type: 'error', name: 'Error', inputs: [{ type: 'string' }] }], errorName: 'Error', args: [msg] })

const rpcError = (code: number, message: string, data?: string) => {
  const e = new Error(message) as Error & { code: number; data?: string }
  e.code = code
  if (data) e.data = data
  return e
}

export function fakeArc(opts: FakeArcOptions = {}): RpcTransport & { calls: RpcCall[]; provider: { request: RpcTransport['request'] } } {
  const blocked = new Set((opts.blocked ?? []).map((a) => a.toLowerCase()))
  const blacklisted = new Set((opts.blacklisted ?? opts.blocked ?? []).map((a) => a.toLowerCase()))
  const calls: RpcCall[] = []

  const nativeSend = (tx: { from?: string; to?: string; value?: string; data?: string }) => {
    const to = (tx.to ?? '').toLowerCase()
    const from = (tx.from ?? '').toLowerCase()
    if (blocked.has(to) || blocked.has(from)) throw rpcError(-32603, 'Blocked address')
    if (to === ZERO && tx.value && BigInt(tx.value) > 0n) {
      throw rpcError(3, 'execution reverted: Zero address not allowed', errorString('Zero address not allowed'))
    }
    if (to === ARC_PRECOMPILE.toLowerCase()) {
      throw rpcError(3, 'execution reverted: Input too short', errorString('Input too short'))
    }
  }

  const request: RpcTransport['request'] = async ({ method, params = [] }) => {
    calls.push({ method, params })
    const tx = (params[0] ?? {}) as { from?: string; to?: string; value?: string; data?: string }

    switch (method) {
      case 'eth_chainId':
        return '0x13b2'
      case 'eth_blockNumber':
        return '0x100000'
      case 'eth_call': {
        if (tx.to?.toLowerCase() === USDC && tx.data?.startsWith(IS_BLACKLISTED_SELECTOR)) {
          if (opts.noIsBlacklisted) throw rpcError(3, 'execution reverted')
          const addr = '0x' + tx.data.slice(-40)
          return '0x' + (blacklisted.has(addr.toLowerCase()) ? '1' : '0').padStart(64, '0')
        }
        if (params.length >= 3 && opts.rejectStateOverride) {
          throw rpcError(-32602, 'too many arguments, want at most 2')
        }
        nativeSend(tx)
        return '0x'
      }
      case 'eth_estimateGas': {
        if (opts.failEstimateGas) throw rpcError(-32000, 'gas required exceeds allowance')
        if (params.length >= 3 && opts.rejectStateOverride) {
          throw rpcError(-32602, 'too many arguments, want at most 2')
        }
        nativeSend(tx)
        return tx.data && tx.data !== '0x' ? '0xc0ba' : '0x5208'
      }
      case 'eth_getLogs':
        return []
      default:
        throw rpcError(-32601, `method not found: ${method}`)
    }
  }

  return { request, calls, provider: { request } }
}

export const addr = (s: string) => s as Address
