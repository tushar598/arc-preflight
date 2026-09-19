/**
 * ethers.live.test.ts — live Arc Testnet tests for the ethers adapter. Opt in with LIVE_RPC=1.
 */
import { describe, it, expect } from 'vitest'
import { JsonRpcProvider, Wallet } from 'ethers'
import {
  preflightEthers,
  withPreflightEthers,
  PreflightError,
  TESTNET_BLOCKLISTED_ADDRESS,
  ARC_TESTNET_RPC_URL,
} from '../../src/index.js'

const provider = new JsonRpcProvider(ARC_TESTNET_RPC_URL)
const SENDER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const CLEAN = '0x1111111111111111111111111111111111111111'
const BLOCKED = TESTNET_BLOCKLISTED_ADDRESS

describe('preflightEthers() — Arc Testnet live', () => {
  it('returns safe: true for a clean recipient', async () => {
    const result = await preflightEthers(SENDER, CLEAN, provider)
    expect(result.safe).toBe(true)
    expect(result.revertReason).toBeNull()
    expect(result.gasEstimate).toBe(21_000n)
  })

  it('flags the blocklisted recipient', async () => {
    const result = await preflightEthers(SENDER, BLOCKED, provider)
    expect(result.safe).toBe(false)
    expect(result.reasonCode).toBe('BLOCKLIST')
    expect(result.revertReason).toContain('Blocked address')
  })

  it('withPreflightEthers() throws PreflightError before the signer is called', async () => {
    let walletCalled = false
    const signer = new Wallet(PRIVATE_KEY, provider)
    signer.sendTransaction = async () => {
      walletCalled = true
      throw new Error('should not reach')
    }
    const guarded = withPreflightEthers(signer, provider)
    await expect(guarded.sendTransaction({ to: BLOCKED, value: 1n })).rejects.toThrow(PreflightError)
    expect(walletCalled).toBe(false)
  })

  it('withPreflightEthers() passes a clean transfer through (simulated send)', async () => {
    let walletCalled = false
    const signer = new Wallet(PRIVATE_KEY, provider)
    signer.sendTransaction = async () => {
      walletCalled = true
      return { hash: '0xmockhash' } as unknown as import('ethers').TransactionResponse
    }
    const guarded = withPreflightEthers(signer, provider)
    const tx = await guarded.sendTransaction({ to: CLEAN, value: 1n })
    expect(walletCalled).toBe(true)
    expect(tx.hash).toBe('0xmockhash')
  })
})
