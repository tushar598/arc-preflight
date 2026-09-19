import { describe, it, expect } from 'vitest'
import { encodeErrorResult } from 'viem'
import { extractRevertReason, classifyRevert, isPrecompileAddress, decodeErrorString } from '../../src/index.js'

const errorString = (msg: string) =>
  encodeErrorResult({ abi: [{ type: 'error', name: 'Error', inputs: [{ type: 'string' }] }], errorName: 'Error', args: [msg] })

describe('extractRevertReason — tiers', () => {
  it('tier 1: decodes Error(string) found anywhere in the error chain', () => {
    const err = { message: 'RPC Request failed.', cause: { code: 3, message: 'execution reverted', data: errorString('Zero address not allowed') } }
    expect(extractRevertReason(err)).toBe('Zero address not allowed')
  })

  it('tier 1: handles ethers-style info.error.data', () => {
    const err = { shortMessage: 'missing revert data', info: { error: { code: 3, data: errorString('Input too short') } } }
    expect(extractRevertReason(err)).toBe('Input too short')
  })

  it('tier 2: finds a known Arc reason inside a generic wrapper message', () => {
    const err = { message: 'An internal error was received.\n\nDetails: Blocked address\nVersion: viem@2.0.0' }
    expect(extractRevertReason(err)).toBe('Blocked address')
  })

  it('tier 2: raw JSON-RPC error object', () => {
    expect(extractRevertReason({ code: -32603, message: 'Blocked address' })).toBe('Blocked address')
  })

  it('tier 3: "execution reverted: X" pattern', () => {
    expect(extractRevertReason(new Error('execution reverted: custom thing happened'))).toBe('custom thing happened')
  })

  it('tier 4: first non-generic details string', () => {
    expect(extractRevertReason({ shortMessage: 'An internal error was received.', details: 'nonce too low' })).toBe('nonce too low')
  })

  it('tier 5: generic fallback', () => {
    expect(extractRevertReason({ message: 'execution reverted' })).toBe('execution reverted')
    expect(extractRevertReason(null)).toBe('unknown error')
  })

  it('does not loop on circular error chains', () => {
    const a: Record<string, unknown> = { message: 'Blocked address' }
    a.cause = a
    expect(extractRevertReason(a)).toBe('Blocked address')
  })
})

describe('decodeErrorString', () => {
  it('returns null for non-Error(string) payloads', () => {
    expect(decodeErrorString('0x')).toBeNull()
    expect(decodeErrorString('0xdeadbeef')).toBeNull()
  })
})

describe('classifyRevert', () => {
  it('maps known reasons to codes', () => {
    expect(classifyRevert('Blocked address')).toBe('BLOCKLIST')
    expect(classifyRevert('runtime-transfer-check')).toBe('BLOCKLIST')
    expect(classifyRevert('Blocked address (USDC.isBlacklisted: 0x…)')).toBe('BLOCKLIST')
    expect(classifyRevert('Zero address not allowed')).toBe('ZERO_ADDRESS')
    expect(classifyRevert('forbidden burn')).toBe('BURN_FORBIDDEN')
    expect(classifyRevert('transfer to self-destructed account')).toBe('BURN_FORBIDDEN')
    expect(classifyRevert('insufficient funds for gas * price + value')).toBe('INSUFFICIENT_FUNDS')
    expect(classifyRevert('ERC20: transfer amount exceeds balance')).toBe('INSUFFICIENT_FUNDS')
    expect(classifyRevert('something else')).toBe('UNKNOWN')
  })

  it('classifies a revert to a precompile destination as PRECOMPILE', () => {
    expect(classifyRevert('Input too short', '0x1800000000000000000000000000000000000001')).toBe('PRECOMPILE')
    expect(classifyRevert('whatever', '0x0000000000000000000000000000000000000004')).toBe('PRECOMPILE')
    expect(classifyRevert('whatever', '0x1111111111111111111111111111111111111111')).toBe('UNKNOWN')
  })

  it('a known reason wins over the precompile heuristic', () => {
    expect(classifyRevert('Blocked address', '0x1800000000000000000000000000000000000001')).toBe('BLOCKLIST')
  })
})

describe('isPrecompileAddress', () => {
  it('covers Ethereum 0x01–0x11, 0x100 and Arc 0x1800…0000–0004', () => {
    expect(isPrecompileAddress('0x0000000000000000000000000000000000000001')).toBe(true)
    expect(isPrecompileAddress('0x0000000000000000000000000000000000000011')).toBe(true)
    expect(isPrecompileAddress('0x0000000000000000000000000000000000000100')).toBe(true)
    expect(isPrecompileAddress('0x1800000000000000000000000000000000000000')).toBe(true)
    expect(isPrecompileAddress('0x1800000000000000000000000000000000000004')).toBe(true)
    expect(isPrecompileAddress('0x1800000000000000000000000000000000000005')).toBe(false)
    expect(isPrecompileAddress('0x0000000000000000000000000000000000000000')).toBe(false)
    expect(isPrecompileAddress('0x0000000000000000000000000000000000000012')).toBe(false)
    expect(isPrecompileAddress('not-an-address')).toBe(false)
  })
})
