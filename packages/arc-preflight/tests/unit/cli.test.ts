import { describe, it, expect, vi, afterEach } from 'vitest'
import { main } from '../../src/cli.js'
import * as transport from '../../src/transport.js'
import { fakeArc, SENDER, CLEAN, BLOCKED, ZERO } from '../helpers/fakeArc.js'

afterEach(() => vi.restoreAllMocks())

function capture() {
  const out: string[] = []
  const err: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { out.push(a.join(' ')) })
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { err.push(a.join(' ')) })
  return { out: () => out.join('\n'), err: () => err.join('\n') }
}

describe('CLI', () => {
  it('prints SAFE and exits 0', async () => {
    vi.spyOn(transport, 'httpTransport').mockReturnValue(fakeArc())
    const c = capture()
    const code = await main([CLEAN, '--from', SENDER])
    expect(code).toBe(0)
    expect(c.out()).toContain('SAFE')
    expect(c.out()).toContain('21000 gas')
  })

  it('prints BLOCKED with reasonCode and layer, exits 1', async () => {
    vi.spyOn(transport, 'httpTransport').mockReturnValue(fakeArc({ blocked: [BLOCKED] }))
    const c = capture()
    const code = await main([BLOCKED, '--from', SENDER, '--chain', 'testnet'])
    expect(code).toBe(1)
    expect(c.out()).toContain('BLOCKED')
    expect(c.out()).toContain('reasonCode:  BLOCKLIST')
    expect(c.out()).toContain('layer:       isBlacklisted')
    expect(c.out()).toContain('0.00068 USDC')
  })

  it('--json emits machine-readable output', async () => {
    vi.spyOn(transport, 'httpTransport').mockReturnValue(fakeArc())
    const c = capture()
    const code = await main([ZERO, '--json'])
    expect(code).toBe(1)
    const parsed = JSON.parse(c.out())
    expect(parsed.reasonCode).toBe('ZERO_ADDRESS')
    expect(parsed.gasEstimate).toBe('34000')
    expect(parsed.sanctions.hit).toBe(false)
  })

  it('rejects bad input with exit 2', async () => {
    const c = capture()
    expect(await main(['not-an-address'])).toBe(2)
    expect(await main([CLEAN, '--chain', 'devnet'])).toBe(2)
    expect(await main([])).toBe(2)
    expect(await main(['--help'])).toBe(0)
    expect(c.err() + c.out()).toContain('Usage')
  })
})
