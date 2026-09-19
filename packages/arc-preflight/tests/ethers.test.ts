import { describe, it, expect } from 'vitest'
import { JsonRpcProvider, Wallet } from 'ethers'
import {
  preflightEthers,
  withPreflightEthers,
  PreflightError,
  TESTNET_BLOCKLISTED_ADDRESS,
  ARC_TESTNET_RPC_URL,
} from '../src/index.js'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const provider = new JsonRpcProvider(ARC_TESTNET_RPC_URL)

/**
 * Sender address: mnemonic index 0 from "test test...junk" (Hardhat/Anvil default).
 * Zero balance on Arc Testnet — the probe uses stateOverride for virtual balance.
 */
const SENDER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

/**
 * A clean recipient that has never been blocklisted on Arc Testnet.
 */
const CLEAN = '0x1111111111111111111111111111111111111111'

/**
 * Known blocklisted address on Arc Testnet.
 */
const BLOCKED = TESTNET_BLOCKLISTED_ADDRESS

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('preflightEthers() — Arc Testnet live', () => {
  it('returns safe: true for a clean recipient', async () => {
    const result = await preflightEthers(SENDER, CLEAN, provider)

    expect(result.safe).toBe(true)
    expect(result.revertReason).toBeNull()
    expect(typeof result.gasEstimate).toBe('bigint')
    expect(result.gasEstimate).toBeGreaterThan(0n)
  })

  it('returns safe: false with revertReason "Blocked address" for blocklisted recipient', async () => {
    const result = await preflightEthers(SENDER, BLOCKED, provider)

    expect(result.safe).toBe(false)
    expect(result.revertReason).toBe('Blocked address')
    expect(result.gasEstimate).toBeGreaterThan(0n)
  })

  it('withPreflightEthers() throws PreflightError before wallet is called for a blocklisted recipient', async () => {
    let walletCalled = false
    const mockSigner = new Wallet(PRIVATE_KEY, provider)
    
    // Override sendTransaction to spy on it
    const originalSendTransaction = mockSigner.sendTransaction.bind(mockSigner)
    mockSigner.sendTransaction = async (tx) => {
      walletCalled = true
      return originalSendTransaction(tx)
    }

    const guarded = withPreflightEthers(mockSigner, provider)

    await expect(
      guarded.sendTransaction({ to: BLOCKED, value: 1n })
    ).rejects.toThrow(PreflightError)

    // Wallet must NOT have been called — the error fires before submission
    expect(walletCalled).toBe(false)
  })

  it('withPreflightEthers() passes a clean transfer through to the wallet (simulated)', async () => {
    let walletCalled = false
    const mockSigner = new Wallet(PRIVATE_KEY, provider)
    
    // Override sendTransaction to spy on it and prevent actual broadcast (since it's a dummy wallet)
    mockSigner.sendTransaction = async () => {
      walletCalled = true
      return { hash: '0xmockhash' } as unknown as import('ethers').TransactionResponse
    }

    const guarded = withPreflightEthers(mockSigner, provider)
    const tx = await guarded.sendTransaction({ to: CLEAN, value: 1n })

    expect(walletCalled).toBe(true)
    expect(tx.hash).toBe('0xmockhash')
  })
})
