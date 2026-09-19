import { describe, it, expect } from 'vitest'
import { createPublicClient, custom, encodeFunctionData, type WalletClient } from 'viem'
import {
  preflight,
  preflightMany,
  withPreflight,
  preflightEthers,
  preflightManyEthers,
  withPreflightEthers,
  PreflightError,
  ERC20_TRANSFER_ABI,
  USDC_ADDRESS,
} from '../../src/index.js'
import { fakeArc, SENDER, CLEAN, BLOCKED, ZERO } from '../helpers/fakeArc.js'

const transfer = (to: `0x${string}`) =>
  encodeFunctionData({ abi: ERC20_TRANSFER_ABI, functionName: 'transfer', args: [to, 1_000_000n] })

const viemClient = (opts?: Parameters<typeof fakeArc>[0]) => {
  const rpc = fakeArc(opts)
  const client = createPublicClient({ transport: custom(rpc.provider, { retryCount: 0 }) })
  return { rpc, client }
}

const mockWallet = () => {
  const sent: unknown[] = []
  const wallet = {
    account: { address: SENDER },
    sendTransaction: async (params: unknown) => {
      sent.push(params)
      return '0xmockhash' as `0x${string}`
    },
  } as unknown as WalletClient
  return { wallet, sent }
}

describe('viem adapter', () => {
  it('preflight() through a real viem client + custom transport: blocked', async () => {
    const { client } = viemClient({ blocked: [BLOCKED], blacklisted: [] })
    const r = await preflight(SENDER, BLOCKED, client)
    expect(r).toMatchObject({ safe: false, revertReason: 'Blocked address', reasonCode: 'BLOCKLIST', layer: 'simulation' })
  })

  it('preflight() through viem: zero address revert with Error(string) data survives viem wrapping', async () => {
    const { client } = viemClient()
    const r = await preflight(SENDER, ZERO, client)
    expect(r).toMatchObject({ safe: false, revertReason: 'Zero address not allowed', reasonCode: 'ZERO_ADDRESS' })
  })

  it('preflight() through viem: safe', async () => {
    const { client } = viemClient()
    const r = await preflight(SENDER, CLEAN, client)
    expect(r.safe).toBe(true)
    expect(r.gasEstimate).toBe(21_000n)
  })

  it('preflightMany() through viem', async () => {
    const { client } = viemClient({ blocked: [BLOCKED] })
    const r = await preflightMany(SENDER, [CLEAN, BLOCKED], client)
    expect(r.safeCount).toBe(1)
    expect(r.blockedCount).toBe(1)
  })

  it('withPreflight() throws PreflightError and does NOT call the wallet for a blocked recipient', async () => {
    const { client } = viemClient({ blocked: [BLOCKED] })
    const { wallet, sent } = mockWallet()
    const guarded = withPreflight(wallet, client)

    const err = await guarded
      .sendTransaction({ to: BLOCKED, value: 1n, account: SENDER, chain: null })
      .catch((e: unknown) => e)

    expect(err).toBeInstanceOf(PreflightError)
    expect((err as PreflightError).reasonCode).toBe('BLOCKLIST')
    expect((err as PreflightError).layer).toBe('isBlacklisted')
    expect((err as PreflightError).result?.recipientsChecked).toEqual([BLOCKED])
    expect(sent).toHaveLength(0)
  })

  it('withPreflight() forwards a clean transfer to the wallet', async () => {
    const { client } = viemClient()
    const { wallet, sent } = mockWallet()
    const guarded = withPreflight(wallet, client)
    const hash = await guarded.sendTransaction({ to: CLEAN, value: 1n, account: SENDER, chain: null })
    expect(hash).toBe('0xmockhash')
    expect(sent).toHaveLength(1)
  })

  it('withPreflight() guards a value:0 ERC-20 transfer() to a blocked recipient', async () => {
    const { client } = viemClient({ blocked: [BLOCKED] })
    const { wallet, sent } = mockWallet()
    const guarded = withPreflight(wallet, client)
    await expect(
      guarded.sendTransaction({ to: USDC_ADDRESS, value: 0n, data: transfer(BLOCKED), account: SENDER, chain: null }),
    ).rejects.toThrow(PreflightError)
    expect(sent).toHaveLength(0)
  })

  it('withPreflight() passes through value:0 with undecodable calldata', async () => {
    const { client, rpc } = viemClient()
    const { wallet, sent } = mockWallet()
    const guarded = withPreflight(wallet, client)
    await guarded.sendTransaction({ to: CLEAN, value: 0n, data: '0xdeadbeef', account: SENDER, chain: null })
    expect(sent).toHaveLength(1)
    expect(rpc.calls).toHaveLength(0)
  })

  it('withPreflight() exposes __preflight and leaves other members untouched', () => {
    const { client } = viemClient()
    const { wallet } = mockWallet()
    const guarded = withPreflight(wallet, client)
    expect(guarded.__preflight).toBe(true)
    expect(guarded.account).toBe(wallet.account)
  })
})

describe('ethers adapter (shares the same engine)', () => {
  const ethersProvider = (opts?: Parameters<typeof fakeArc>[0]) => {
    const rpc = fakeArc(opts)
    return { rpc, provider: { send: (method: string, params: unknown[]) => rpc.request({ method, params }) } }
  }

  it('preflightEthers(): blocked', async () => {
    const { provider } = ethersProvider({ blocked: [BLOCKED] })
    const r = await preflightEthers(SENDER, BLOCKED, provider)
    expect(r).toMatchObject({ safe: false, reasonCode: 'BLOCKLIST', layer: 'isBlacklisted' })
  })

  it('preflightEthers(): safe', async () => {
    const { provider } = ethersProvider()
    const r = await preflightEthers(SENDER, CLEAN, provider)
    expect(r.safe).toBe(true)
  })

  it('preflightManyEthers()', async () => {
    const { provider } = ethersProvider({ blocked: [BLOCKED] })
    const r = await preflightManyEthers(SENDER, [CLEAN, BLOCKED, ZERO], provider)
    expect(r.blockedCount).toBe(2)
  })

  it('withPreflightEthers() blocks before the signer is called (value + calldata paths)', async () => {
    const { provider } = ethersProvider({ blocked: [BLOCKED] })
    const sent: unknown[] = []
    const signer = {
      getAddress: async () => SENDER,
      sendTransaction: async (tx: unknown) => {
        sent.push(tx)
        return { hash: '0xmockhash' }
      },
    }
    const guarded = withPreflightEthers(signer as never, provider)

    await expect(guarded.sendTransaction({ to: BLOCKED, value: 1n })).rejects.toThrow(PreflightError)
    await expect(guarded.sendTransaction({ to: USDC_ADDRESS, value: 0, data: transfer(BLOCKED) })).rejects.toThrow(PreflightError)
    expect(sent).toHaveLength(0)

    const tx = await guarded.sendTransaction({ to: CLEAN, value: 1n })
    expect((tx as { hash: string }).hash).toBe('0xmockhash')
    expect(sent).toHaveLength(1)
  })
})
