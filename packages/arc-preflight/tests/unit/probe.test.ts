import { describe, it, expect } from 'vitest'
import { encodeFunctionData } from 'viem'
import {
  probe,
  runPreflightMany,
  ERC20_TRANSFER_ABI,
  MULTICALL3FROM_ABI,
  USDC_ADDRESS,
  MULTICALL3FROM_ADDRESS,
  USDC_TRANSFER_GAS_ESTIMATE,
  MAINNET_DEMO_BLOCKED_ADDRESS,
  type BlocklistCache,
} from '../../src/index.js'
import { fakeArc, SENDER, CLEAN, CLEAN2, BLOCKED, ZERO, ARC_PRECOMPILE } from '../helpers/fakeArc.js'

const transfer = (to: `0x${string}`) =>
  encodeFunctionData({ abi: ERC20_TRANSFER_ABI, functionName: 'transfer', args: [to, 1_000_000n] })

const fakeCache = (members: string[]): BlocklistCache => {
  const set = new Set(members.map((m) => m.toLowerCase()))
  return {
    has: (a) => set.has(a.toLowerCase()),
    start: async () => {},
    stop: () => {},
    get isRunning() { return true },
    get size() { return set.size },
    get startedAt() { return new Date() },
  }
}

describe('probe() — layered check', () => {
  it('safe recipient: passes all four layers, returns a LIVE gas estimate', async () => {
    const rpc = fakeArc()
    const r = await probe(SENDER, CLEAN, rpc)
    expect(r).toMatchObject({ safe: true, revertReason: null, layer: 'simulation', recipientsChecked: [CLEAN] })
    expect(r.reasonCode).toBeUndefined()
    expect(r.gasEstimate).toBe(21_000n)
    const methods = rpc.calls.map((c) => c.method)
    expect(methods).toEqual(['eth_call', 'eth_call', 'eth_call', 'eth_estimateGas'])
  })

  it('runtime-blocked recipient (not in OFAC / cache / isBlacklisted): caught by simulation', async () => {
    const rpc = fakeArc({ blocked: [BLOCKED], blacklisted: [] })
    const r = await probe(SENDER, BLOCKED, rpc)
    expect(r).toMatchObject({ safe: false, revertReason: 'Blocked address', reasonCode: 'BLOCKLIST', layer: 'simulation' })
    expect(r.gasEstimate).toBe(USDC_TRANSFER_GAS_ESTIMATE)
  })

  it('blocked sender is caught too', async () => {
    const rpc = fakeArc({ blocked: [BLOCKED], blacklisted: [] })
    const r = await probe(BLOCKED, CLEAN, rpc)
    expect(r.safe).toBe(false)
    expect(r.reasonCode).toBe('BLOCKLIST')
  })

  it('layer isBlacklisted: USDC.isBlacklisted() short-circuits before simulation', async () => {
    const rpc = fakeArc({ blocked: [BLOCKED] })
    const r = await probe(SENDER, BLOCKED, rpc)
    expect(r.safe).toBe(false)
    expect(r.layer).toBe('isBlacklisted')
    expect(r.reasonCode).toBe('BLOCKLIST')
    expect(r.revertReason).toContain('isBlacklisted')
    // Only the two isBlacklisted eth_calls — no native simulation, no estimateGas.
    expect(rpc.calls.map((c) => c.method)).toEqual(['eth_call', 'eth_call'])
  })

  it('layer isBlacklisted degrades gracefully when the method is missing', async () => {
    const rpc = fakeArc({ blocked: [BLOCKED], noIsBlacklisted: true })
    const r = await probe(SENDER, BLOCKED, rpc)
    expect(r.safe).toBe(false)
    expect(r.layer).toBe('simulation')
  })

  it('layer sanctions: OFAC hit needs zero RPC calls', async () => {
    const rpc = fakeArc()
    const r = await probe(SENDER, MAINNET_DEMO_BLOCKED_ADDRESS, rpc)
    expect(r).toMatchObject({ safe: false, layer: 'sanctions', reasonCode: 'BLOCKLIST' })
    expect(r.revertReason).toContain('OFAC SDN')
    expect(rpc.calls).toHaveLength(0)
  })

  it('layer cache: hit needs zero RPC calls', async () => {
    const rpc = fakeArc()
    const r = await probe(SENDER, CLEAN, rpc, { cache: fakeCache([CLEAN]) })
    expect(r).toMatchObject({ safe: false, layer: 'cache', reasonCode: 'BLOCKLIST', revertReason: 'Blocked address (cached)' })
    expect(rpc.calls).toHaveLength(0)
  })

  it('zero address: earlier layers say clean, simulation still catches it', async () => {
    const rpc = fakeArc()
    const r = await probe(SENDER, ZERO, rpc)
    expect(r).toMatchObject({ safe: false, revertReason: 'Zero address not allowed', reasonCode: 'ZERO_ADDRESS', layer: 'simulation' })
  })

  it('Arc precompile destination → PRECOMPILE', async () => {
    const rpc = fakeArc()
    const r = await probe(SENDER, ARC_PRECOMPILE, rpc)
    expect(r).toMatchObject({ safe: false, revertReason: 'Input too short', reasonCode: 'PRECOMPILE' })
  })

  it('stateOverride rejected by RPC → retries without it and still gets the verdict', async () => {
    const rpc = fakeArc({ blocked: [BLOCKED], blacklisted: [], rejectStateOverride: true })
    const r = await probe(SENDER, BLOCKED, rpc)
    expect(r).toMatchObject({ safe: false, revertReason: 'Blocked address', reasonCode: 'BLOCKLIST' })
    const sims = rpc.calls.filter((c) => c.method === 'eth_call' && (c.params[0] as { to: string }).to === BLOCKED)
    expect(sims).toHaveLength(2)
    expect(sims[0].params).toHaveLength(3)
    expect(sims[1].params).toHaveLength(2)
  })

  it('stateOverride rejected on a safe path → safe with a live estimate from the fallback', async () => {
    const rpc = fakeArc({ rejectStateOverride: true })
    const r = await probe(SENDER, CLEAN, rpc)
    expect(r.safe).toBe(true)
    expect(r.gasEstimate).toBe(21_000n)
  })

  it('estimateGas failure falls back to the documented constant', async () => {
    const rpc = fakeArc({ failEstimateGas: true })
    const r = await probe(SENDER, CLEAN, rpc)
    expect(r.safe).toBe(true)
    expect(r.gasEstimate).toBe(USDC_TRANSFER_GAS_ESTIMATE)
  })

  it('simulatedValue: 0 with no data throws RangeError', async () => {
    await expect(probe(SENDER, CLEAN, fakeArc(), { simulatedValue: 0n })).rejects.toThrow(RangeError)
  })

  it('negative simulatedValue throws RangeError', async () => {
    await expect(probe(SENDER, CLEAN, fakeArc(), { simulatedValue: -1n })).rejects.toThrow(RangeError)
  })
})

describe('probe() — calldata awareness', () => {
  it('value 0 + ERC-20 transfer() to a blocked recipient is BLOCKED', async () => {
    const rpc = fakeArc({ blocked: [BLOCKED] })
    const r = await probe(SENDER, USDC_ADDRESS, rpc, { simulatedValue: 0n, data: transfer(BLOCKED) })
    expect(r.safe).toBe(false)
    expect(r.reasonCode).toBe('BLOCKLIST')
    expect(r.recipientsChecked).toEqual([BLOCKED])
  })

  it('value 0 + ERC-20 transfer() to a clean recipient is SAFE with calldata-aware gas', async () => {
    const rpc = fakeArc()
    const r = await probe(SENDER, USDC_ADDRESS, rpc, { simulatedValue: 0n, data: transfer(CLEAN) })
    expect(r.safe).toBe(true)
    expect(r.gasEstimate).toBe(49_338n)
    const est = rpc.calls.find((c) => c.method === 'eth_estimateGas')!
    expect((est.params[0] as { data: string }).data).toBe(transfer(CLEAN))
  })

  it('aggregate3 payroll with one blocked inner recipient → whole tx BLOCKED, all recipients listed', async () => {
    const rpc = fakeArc({ blocked: [BLOCKED] })
    const data = encodeFunctionData({
      abi: MULTICALL3FROM_ABI,
      functionName: 'aggregate3',
      args: [[
        { target: USDC_ADDRESS, allowFailure: false, callData: transfer(CLEAN) },
        { target: USDC_ADDRESS, allowFailure: false, callData: transfer(CLEAN2) },
        { target: USDC_ADDRESS, allowFailure: false, callData: transfer(BLOCKED) },
      ]],
    })
    const r = await probe(SENDER, MULTICALL3FROM_ADDRESS, rpc, { simulatedValue: 0n, data })
    expect(r.safe).toBe(false)
    expect(r.reasonCode).toBe('BLOCKLIST')
    expect(r.recipientsChecked).toEqual([CLEAN, CLEAN2, BLOCKED])
  })

  it('aggregate3 payroll with all-clean recipients → SAFE', async () => {
    const rpc = fakeArc()
    const data = encodeFunctionData({
      abi: MULTICALL3FROM_ABI,
      functionName: 'aggregate3',
      args: [[
        { target: USDC_ADDRESS, allowFailure: false, callData: transfer(CLEAN) },
        { target: USDC_ADDRESS, allowFailure: false, callData: transfer(CLEAN2) },
      ]],
    })
    const r = await probe(SENDER, MULTICALL3FROM_ADDRESS, rpc, { simulatedValue: 0n, data })
    expect(r.safe).toBe(true)
    expect(r.recipientsChecked).toEqual([CLEAN, CLEAN2])
  })
})

describe('runPreflightMany()', () => {
  it('checks every recipient with bounded concurrency and counts verdicts', async () => {
    const rpc = fakeArc({ blocked: [BLOCKED] })
    const recipients = [CLEAN, BLOCKED, CLEAN2, ZERO, MAINNET_DEMO_BLOCKED_ADDRESS]
    const { results, safeCount, blockedCount } = await runPreflightMany(SENDER, recipients, rpc, { concurrency: 2 })
    expect(results).toHaveLength(5)
    expect(safeCount).toBe(2)
    expect(blockedCount).toBe(3)
    expect(results.map((r) => r.reasonCode)).toEqual([undefined, 'BLOCKLIST', undefined, 'ZERO_ADDRESS', 'BLOCKLIST'])
    expect(results.map((r) => r.layer)).toEqual(['simulation', 'isBlacklisted', 'simulation', 'simulation', 'sanctions'])
  })

  it('empty input', async () => {
    const r = await runPreflightMany(SENDER, [], fakeArc())
    expect(r).toEqual({ results: [], safeCount: 0, blockedCount: 0 })
  })
})
