/**
 * preflight.live.test.ts
 *
 * Live integration tests against Arc Testnet. Opt in with LIVE_RPC=1.
 * These make real RPC calls — no mocking — and prove the engine against
 * the actual runtime blocklist.
 */

import { describe, it, expect } from 'vitest'
import { createPublicClient, http, encodeFunctionData, type WalletClient } from 'viem'
import {
  preflight,
  preflightMany,
  withPreflight,
  PreflightError,
  TESTNET_BLOCKLISTED_ADDRESS,
  ARC_TESTNET_RPC_URL,
  ERC20_TRANSFER_ABI,
  USDC_ADDRESS,
  ZERO_ADDRESS,
} from '../../src/index.js'

const client = createPublicClient({ transport: http(ARC_TESTNET_RPC_URL) })

/** Mnemonic index 0 from "test test…junk" — zero balance; the probe uses stateOverride. */
const SENDER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const
const CLEAN = '0x1111111111111111111111111111111111111111' as const
const BLOCKED = TESTNET_BLOCKLISTED_ADDRESS

describe('preflight() — Arc Testnet live', () => {
  it('returns safe: true with a live gas estimate for a clean recipient', async () => {
    const result = await preflight(SENDER, CLEAN, client)
    expect(result.safe).toBe(true)
    expect(result.revertReason).toBeNull()
    expect(result.layer).toBe('simulation')
    expect(result.gasEstimate).toBe(21_000n)
  })

  it('flags the seeded testnet blocklisted address via USDC.isBlacklisted()', async () => {
    const result = await preflight(SENDER, BLOCKED, client)
    expect(result.safe).toBe(false)
    expect(result.reasonCode).toBe('BLOCKLIST')
    expect(result.layer).toBe('isBlacklisted')
    expect(result.revertReason).toContain('Blocked address')
  })

  it('zero address → ZERO_ADDRESS from simulation', async () => {
    const result = await preflight(SENDER, ZERO_ADDRESS, client)
    expect(result).toMatchObject({ safe: false, reasonCode: 'ZERO_ADDRESS', layer: 'simulation', revertReason: 'Zero address not allowed' })
  })

  it('value 0 ERC-20 transfer() to the blocked address is caught', async () => {
    const data = encodeFunctionData({ abi: ERC20_TRANSFER_ABI, functionName: 'transfer', args: [BLOCKED, 1n] })
    const result = await preflight(SENDER, USDC_ADDRESS, client, { simulatedValue: 0n, data })
    expect(result.safe).toBe(false)
    expect(result.recipientsChecked).toEqual([BLOCKED])
  })

  it('preflightMany() counts verdicts', async () => {
    const r = await preflightMany(SENDER, [CLEAN, BLOCKED, ZERO_ADDRESS], client)
    expect(r.safeCount).toBe(1)
    expect(r.blockedCount).toBe(2)
  })

  it('withPreflight() throws PreflightError before wallet is called for a blocklisted recipient', async () => {
    let walletCalled = false
    const mockWallet = {
      account: SENDER,
      sendTransaction: async () => {
        walletCalled = true
        return '0xmockhash' as `0x${string}`
      },
    } as unknown as WalletClient

    const guarded = withPreflight(mockWallet, client)
    await expect(
      guarded.sendTransaction({ to: BLOCKED, value: 1n, account: SENDER, chain: null }),
    ).rejects.toThrow(PreflightError)
    expect(walletCalled).toBe(false)
  })

  it('withPreflight() passes a clean transfer through to the wallet', async () => {
    let walletCalled = false
    const mockWallet = {
      account: SENDER,
      sendTransaction: async () => {
        walletCalled = true
        return '0xmockhash' as `0x${string}`
      },
    } as unknown as WalletClient

    const guarded = withPreflight(mockWallet, client)
    const hash = await guarded.sendTransaction({ to: CLEAN, value: 1n, account: SENDER, chain: null })
    expect(walletCalled).toBe(true)
    expect(hash).toBe('0xmockhash')
  })
})
