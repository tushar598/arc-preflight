/**
 * revert.ts
 *
 * Revert-reason extraction and classification, shared by every adapter.
 *
 * RPC libraries wrap JSON-RPC errors differently (viem nests them under
 * `cause`, ethers under `info.error`, raw fetch gives you the bare object).
 * Rather than special-casing each library we walk the whole error chain,
 * collect every candidate string / hex payload, and apply one set of rules.
 */

import type { Address } from 'viem'
import type { PreflightReasonCode } from './types.js'
import { ARC_PRECOMPILE_ADDRESSES } from './constants.js'

// ---------------------------------------------------------------------------
// Error-chain walking
// ---------------------------------------------------------------------------

type Candidate = { text: string[]; data: string[] }

const GENERIC_WRAPPERS = [
  'transaction creation failed',
  'an internal error was received',
  'internal error',
  'rpc request failed',
  'call exception',
  'missing revert data',
  'execution reverted',
  'unknown error',
  'transaction failed',
]

function isGeneric(s: string): boolean {
  const l = s.trim().toLowerCase()
  return l === '' || GENERIC_WRAPPERS.some((g) => l === g || l === `${g}.`)
}

/** Recursively collect string and hex-data candidates from an error chain. */
function collect(err: unknown, out: Candidate, depth = 0, seen = new Set<unknown>()): void {
  if (err == null || depth > 8 || seen.has(err)) return
  seen.add(err)

  if (typeof err === 'string') {
    out.text.push(err)
    return
  }
  if (typeof err !== 'object') return

  const e = err as Record<string, unknown>

  for (const key of ['data', 'details', 'shortMessage', 'message', 'reason']) {
    const v = e[key]
    if (typeof v === 'string' && v.length > 0) {
      if (key === 'data' && v.startsWith('0x')) out.data.push(v)
      else if (key !== 'data') out.text.push(v)
    } else if (v && typeof v === 'object' && key === 'data') {
      // ethers sometimes nests data: { data: '0x…' }
      const inner = (v as { data?: unknown }).data
      if (typeof inner === 'string' && inner.startsWith('0x')) out.data.push(inner)
    }
  }

  for (const key of ['cause', 'error', 'info', 'walk']) {
    const v = e[key]
    if (v && typeof v === 'object') collect(v, out, depth + 1, seen)
  }
}

// ---------------------------------------------------------------------------
// Error(string) ABI decoding
// ---------------------------------------------------------------------------

/** Decodes a solidity `Error(string)` payload (selector 0x08c379a0). */
export function decodeErrorString(data: string): string | null {
  if (!data.toLowerCase().startsWith('0x08c379a0')) return null
  try {
    const hex = data.slice(10)
    const offset = parseInt(hex.slice(0, 64), 16) * 2
    const length = parseInt(hex.slice(offset, offset + 64), 16)
    const strHex = hex.slice(offset + 64, offset + 64 + length * 2)
    const bytes = strHex.match(/.{2}/g)
    if (!bytes) return null
    const decoded = new TextDecoder().decode(new Uint8Array(bytes.map((b) => parseInt(b, 16))))
    return decoded || null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/**
 * Extracts a human-readable revert reason from any RPC/library error.
 *
 * Tiers, in order of reliability:
 * 1. ABI-decoded `Error(string)` payload found anywhere in the chain
 * 2. A known Arc reason string ("Blocked address", "Zero address not allowed", …)
 * 3. `execution reverted: <reason>` / `reverted with reason: <reason>` patterns
 * 4. The first non-generic `details` / `message` / `shortMessage` string
 * 5. Generic fallback `"execution reverted"`
 */
export function extractRevertReason(err: unknown): string {
  if (err == null) return 'unknown error'

  const c: Candidate = { text: [], data: [] }
  collect(err, c)

  // Tier 1 — ABI-decoded Error(string)
  for (const d of c.data) {
    const decoded = decodeErrorString(d)
    if (decoded) return decoded
  }

  // Tier 2 — known Arc reasons
  const KNOWN = [
    /Blocked address/i,
    /runtime-transfer-check/i,
    /Zero address not allowed/i,
    /Input too short/i,
  ]
  for (const t of c.text) {
    for (const re of KNOWN) {
      const m = t.match(re)
      if (m) return m[0]
    }
  }

  // Tier 3 — "execution reverted: X" style patterns
  const PATTERNS = [
    /execution reverted(?:\s+with\s+reason)?:\s*(.+?)(?:\.\s|\.$|$|\n)/i,
    /reverted(?:\s+with\s+reason)?(?:\s+string)?:\s*['"]?(.+?)['"]?(?:\.\s|\.$|$|\n)/i,
    /Revert:\s*(.+?)(?:\.\s|\.$|$|\n)/i,
    /reason:\s*(.+?)(?:\.\s|\.$|$|\n)/i,
  ]
  for (const t of c.text) {
    for (const re of PATTERNS) {
      const m = t.match(re)
      if (m?.[1] && !isGeneric(m[1])) return m[1].replace(/^revert:\s*/i, '').trim()
    }
  }

  // Tier 4 — first non-generic candidate string (single line only)
  for (const t of c.text) {
    const first = t.split('\n')[0].replace(/^revert:\s*/i, '').trim()
    if (!isGeneric(first) && first.length <= 200) return first
  }

  // Tier 5
  return 'execution reverted'
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/** Ethereum precompiles 0x01–0x11 plus Osaka P256VERIFY (0x100) and Arc's 0x1800… range. */
export function isPrecompileAddress(address: string): boolean {
  const a = address.toLowerCase()
  if (!/^0x[0-9a-f]{40}$/.test(a)) return false
  if (ARC_PRECOMPILE_ADDRESSES.some((p) => p.toLowerCase() === a)) return true
  const n = BigInt(a)
  return (n >= 1n && n <= 0x11n) || n === 0x100n
}

/**
 * Maps a revert reason (and the destination address) to a `PreflightReasonCode`.
 */
export function classifyRevert(reason: string, recipient?: Address | string): PreflightReasonCode {
  const r = reason.toLowerCase()
  if (/blocked address|runtime-transfer-check|blacklist/.test(r)) return 'BLOCKLIST'
  if (/zero address/.test(r)) return 'ZERO_ADDRESS'
  if (/burn|selfdestruct|self-destruct|destructed/.test(r)) return 'BURN_FORBIDDEN'
  if (/insufficient funds|insufficient balance|exceeds balance|out of gas|intrinsic gas|gas required exceeds/.test(r)) {
    return 'INSUFFICIENT_FUNDS'
  }
  if (recipient && isPrecompileAddress(recipient)) return 'PRECOMPILE'
  return 'UNKNOWN'
}
