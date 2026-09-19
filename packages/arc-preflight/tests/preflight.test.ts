/**
 * preflight.test.ts
 *
 * Live integration tests for the arc-preflight SDK against Arc Testnet.
 *
 * These tests make real RPC calls — no mocking. They prove that:
 *   1. A clean address is correctly identified as safe
 *   2. The known blocklisted testnet address is correctly flagged
 *   3. withPreflight() throws PreflightError before any wallet call
 *   4. withPreflight() passes safe transfers through to the wallet
 *
 * Network: Arc Testnet (https://rpc.testnet.arc.network)
 * Requires: internet connection
 */

import { describe, it, expect } from 'vitest'
import { createPublicClient, http } from 'viem'
import {
  preflight,
  withPreflight,
  PreflightError,
  TESTNET_BLOCKLISTED_ADDRESS,
  ARC_TESTNET_RPC_URL,
} from '../src/index.js'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const client = createPublicClient({
  transport: http(ARC_TESTNET_RPC_URL),
})

/**
 * Sender address: mnemonic index 0 from "test test...junk" (Hardhat/Anvil default).
 * Zero balance on Arc Testnet — the probe uses stateOverride for virtual balance.
 */
const SENDER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const

/**
 * A clean recipient that has never been blocklisted on Arc Testnet.
 */
const CLEAN = '0x1111111111111111111111111111111111111111' as const

/**
 * Known blocklisted address on Arc Testnet.
 * Mnemonic index 1 from "test test...junk".
 * Source: Arc documentation.
 */
const BLOCKED = TESTNET_BLOCKLISTED_ADDRESS

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('preflight() — Arc Testnet live', () => {
  it('returns safe: true for a clean recipient', async () => {
    const result = await preflight(SENDER, CLEAN, client)

    expect(result.safe).toBe(true)
    expect(result.revertReason).toBeNull()
    expect(typeof result.gasEstimate).toBe('bigint')
    expect(result.gasEstimate).toBeGreaterThan(0n)
  })

  it('returns safe: false with revertReason "Blocked address" for blocklisted recipient', async () => {
    const result = await preflight(SENDER, BLOCKED, client)

    expect(result.safe).toBe(false)
    expect(result.revertReason).toBe('Blocked address')
    expect(result.gasEstimate).toBeGreaterThan(0n)
  })

  it('withPreflight() throws PreflightError before wallet is called for a blocklisted recipient', async () => {
    let walletCalled = false
    const mockWallet = {
      account: SENDER,
      sendTransaction: async () => {
        walletCalled = true
        return '0xmockhash' as `0x${string}`
      },
    } as any

    const guarded = withPreflight(mockWallet, client)

    await expect(
      guarded.sendTransaction({ to: BLOCKED, value: 1n }),
    ).rejects.toThrow(PreflightError)

    // Wallet must NOT have been called — the error fires before submission
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
    } as any

    const guarded = withPreflight(mockWallet, client)
    const hash = await guarded.sendTransaction({ to: CLEAN, value: 1n })

    expect(walletCalled).toBe(true)
    expect(hash).toBe('0xmockhash')
  })
})
