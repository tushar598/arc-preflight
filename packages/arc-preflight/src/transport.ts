/**
 * transport.ts
 *
 * Adapters from viem / ethers clients to the minimal `RpcTransport` interface
 * used by the shared probe.
 */

import type { PublicClient } from 'viem'
import type { RpcTransport } from './types.js'

/** Wraps a viem `PublicClient` as an `RpcTransport`. */
export function transportFromViem(client: PublicClient): RpcTransport {
  const request = client.request as unknown as (
    args: { method: string; params?: unknown[] },
  ) => Promise<unknown>
  return {
    request: (args) => request(args),
  }
}

/**
 * Wraps an ethers v6 `JsonRpcProvider` (or anything with a `send(method,
 * params)` method) as an `RpcTransport`.
 */
export function transportFromEthers(provider: {
  send(method: string, params: unknown[]): Promise<unknown>
}): RpcTransport {
  return {
    request: ({ method, params }) => provider.send(method, params ?? []),
  }
}

/**
 * A dependency-free JSON-RPC transport over `fetch`. Used by the CLI; handy
 * anywhere you don't want to construct a viem or ethers client.
 *
 * JSON-RPC error objects are thrown as-is (`{ code, message, data }`), which
 * the revert extractor understands.
 */
export function httpTransport(url: string, init?: { headers?: Record<string, string> }): RpcTransport {
  let id = 0
  return {
    async request({ method, params }) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params: params ?? [] }),
      })
      if (!res.ok) {
        throw new Error(`arc-preflight: RPC HTTP ${res.status} ${res.statusText}`)
      }
      const json = (await res.json()) as { result?: unknown; error?: { code: number; message: string; data?: unknown } }
      if (json.error) {
        const e = new Error(json.error.message) as Error & { code?: number; data?: unknown }
        e.code = json.error.code
        e.data = json.error.data
        throw e
      }
      return json.result
    },
  }
}
