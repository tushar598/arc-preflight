import { describe, it, expect, vi } from 'vitest'
import { createPublicClient, http } from 'viem'
import {
  createBlocklistCache,
  preflight,
  USDC_ADDRESS,
  USDC_EVENTS_ABI,
} from '../src/index.js'

const TEST_RPC = 'https://rpc.testnet.arc.network'
const SENDER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const
const BLOCKED = '0x1234567890123456789012345678901234567890' as const

describe('Local Blocklist Cache', () => {
  it('adds and removes addresses correctly and bypasses RPC', async () => {
    const client = createPublicClient({ transport: http(TEST_RPC) })
    
    // 1. Mock watchContractEvent to capture the callback
    let eventCallback: ((logs: unknown[]) => void) | undefined
    const watchMock = vi.spyOn(client, 'watchContractEvent').mockImplementation(
      (args: unknown) => {
        eventCallback = (args as { onLogs: (logs: unknown[]) => void }).onLogs
        return () => {} // return mock unwatch function
      }
    )

    // 2. Create and start cache
    const cache = createBlocklistCache(client)
    expect(cache.isRunning).toBe(false)
    cache.start()
    expect(cache.isRunning).toBe(true)
    expect(watchMock).toHaveBeenCalledWith({
      address: USDC_ADDRESS,
      abi: USDC_EVENTS_ABI,
      onLogs: expect.any(Function),
    })

    // 3. Simulate Blacklisted event
    expect(cache.has(BLOCKED)).toBe(false)
    eventCallback!([{
      eventName: 'Blacklisted',
      args: { _account: BLOCKED }
    }])
    expect(cache.has(BLOCKED)).toBe(true)

    // 4. Verify preflight checks the cache (should return safe: false instantly)
    // We mock client.call to ensure the RPC isn't hit
    const callMock = vi.spyOn(client, 'call').mockRejectedValue(new Error('Should not hit RPC'))
    
    const result = await preflight(SENDER, BLOCKED, client, { cache })
    expect(result.safe).toBe(false)
    expect(result.revertReason).toBe('Blocked address (cached)')
    expect(result.gasEstimate).toBe(34000n)
    expect(callMock).not.toHaveBeenCalled()

    // 5. Simulate UnBlacklisted event
    eventCallback!([{
      eventName: 'UnBlacklisted',
      args: { _account: BLOCKED }
    }])
    expect(cache.has(BLOCKED)).toBe(false)

    cache.stop()
    expect(cache.isRunning).toBe(false)
  })
})
