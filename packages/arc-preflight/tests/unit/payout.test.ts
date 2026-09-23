import { describe, it, expect } from 'vitest'
import {
  createPublicClient,
  custom,
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  encodeFunctionResult,
  type Hex,
  type WalletClient,
} from 'viem'
import {
  planPayout,
  planPayoutEthers,
  runPlanPayout,
  parsePayoutLogs,
  fetchPayoutStats,
  decodeTransferIntents,
  withPreflight,
  PreflightError,
  PREFLIGHT_PAYOUT_ABI,
  PREFLIGHT_PAYOUT_ADDRESS,
  type RpcTransport,
} from '../../src/index.js'
import { fakeArc, SENDER, CLEAN, CLEAN2, BLOCKED, ZERO, addr } from '../helpers/fakeArc.js'

const ECRECOVER = addr('0x0000000000000000000000000000000000000001')
const REF = `0x${'ab'.repeat(32)}` as Hex
const ONE = 10n ** 18n

const decodePayMany = (data: Hex) => {
  const d = decodeFunctionData({ abi: PREFLIGHT_PAYOUT_ABI, data })
  if (d.functionName !== 'payMany') throw new Error('not payMany')
  return d.args
}

describe('planPayout', () => {
  const payees = [
    { to: CLEAN, amount: ONE },
    { to: BLOCKED, amount: 2n * ONE },
    { to: ZERO, amount: 3n * ONE },
    { to: ECRECOVER, amount: 4n * ONE },
    { to: CLEAN2, amount: 5n * ONE },
  ]

  it('predicts what the contract pays and skips, and builds payMany for the clean payees', async () => {
    const plan = await runPlanPayout(fakeArc({ blocked: [BLOCKED] }), SENDER, payees, { ref: REF })

    expect(plan.pay.map((e) => e.to)).toEqual([CLEAN, CLEAN2])
    expect(plan.skip).toMatchObject([
      { to: BLOCKED, reasonCode: 'BLOCKLIST', layer: 'isBlacklisted' },
      { to: ZERO, reasonCode: 'ZERO_ADDRESS', layer: 'contract' },
      // Arc accepts value to 0x01 and the USDC is gone; the plan must still skip it.
      { to: ECRECOVER, reasonCode: 'PRECOMPILE', layer: 'contract' },
    ])
    expect(plan.payValue).toBe(6n * ONE)
    expect(plan.skipValue).toBe(9n * ONE)

    expect(plan.tx).not.toBeNull()
    expect(plan.tx!.to).toBe(PREFLIGHT_PAYOUT_ADDRESS)
    expect(plan.tx!.value).toBe(6n * ONE)
    expect(decodePayMany(plan.tx!.data)).toEqual([[CLEAN, CLEAN2], [ONE, 5n * ONE], REF])
  })

  it('includeSkipped keeps every payee so the contract records the skips on-chain', async () => {
    const plan = await runPlanPayout(fakeArc({ blocked: [BLOCKED] }), SENDER, payees, { includeSkipped: true })
    const [to, amounts, ref] = decodePayMany(plan.tx!.data)
    expect(to).toEqual(payees.map((p) => p.to))
    expect(amounts).toEqual(payees.map((p) => p.amount))
    expect(plan.tx!.value).toBe(15n * ONE)
    expect(ref).toBe(`0x${'00'.repeat(32)}`)
  })

  it('no transaction when every payee would be skipped', async () => {
    const plan = await runPlanPayout(fakeArc({ blocked: [BLOCKED] }), SENDER, [
      { to: BLOCKED, amount: 1n },
      { to: ZERO, amount: 1n },
    ], { includeSkipped: true })
    expect(plan.pay).toEqual([])
    expect(plan.tx).toBeNull()
  })

  it('does not hit the RPC for payees the static rules already skip', async () => {
    const rpc = fakeArc()
    await runPlanPayout(rpc, SENDER, [{ to: ZERO, amount: 1n }, { to: ECRECOVER, amount: 1n }])
    expect(rpc.calls).toEqual([])
  })

  it('rejects an empty list and non-positive amounts', async () => {
    await expect(runPlanPayout(fakeArc(), SENDER, [])).rejects.toThrow(RangeError)
    await expect(runPlanPayout(fakeArc(), SENDER, [{ to: CLEAN, amount: 0n }])).rejects.toThrow(/payee 0/)
  })

  it('viem and ethers wrappers', async () => {
    const rpc = fakeArc({ blocked: [BLOCKED] })
    const client = createPublicClient({ transport: custom(rpc.provider, { retryCount: 0 }) })
    const v = await planPayout(SENDER, [{ to: CLEAN, amount: 1n }, { to: BLOCKED, amount: 1n }], client)
    expect(v.pay.length).toBe(1)

    const provider = { send: (method: string, params: unknown[]) => rpc.request({ method, params }) }
    const e = await planPayoutEthers(SENDER, [{ to: CLEAN, amount: 1n }, { to: BLOCKED, amount: 1n }], provider)
    expect(e.skip.map((s) => s.to)).toEqual([BLOCKED])
  })
})

describe('payMany through the guard', () => {
  const payManyTx = (payees: `0x${string}`[]) => ({
    to: PREFLIGHT_PAYOUT_ADDRESS,
    value: BigInt(payees.length),
    data: encodeFunctionData({
      abi: PREFLIGHT_PAYOUT_ABI,
      functionName: 'payMany',
      args: [payees, payees.map(() => 1n), REF],
    }),
  })

  it('decodes to one payout intent carrying the calldata, not one intent per payee', () => {
    const tx = payManyTx([CLEAN, BLOCKED])
    expect(decodeTransferIntents({ from: SENDER, ...tx })).toEqual([
      { from: SENDER, to: PREFLIGHT_PAYOUT_ADDRESS, value: 2n, via: 'payout', data: tx.data },
    ])
  })

  it('withPreflight lets a batch with a blocked payee through — the contract refunds it', async () => {
    const rpc = fakeArc({ blocked: [BLOCKED] })
    const client = createPublicClient({ transport: custom(rpc.provider, { retryCount: 0 }) })
    const sent: unknown[] = []
    const wallet = {
      account: { address: SENDER },
      sendTransaction: async (p: unknown) => (sent.push(p), '0xhash' as Hex),
    } as unknown as WalletClient
    await withPreflight(wallet, client).sendTransaction(payManyTx([CLEAN, BLOCKED]) as never)
    expect(sent.length).toBe(1)

    // …and it simulated the real payMany call, calldata included.
    const tx = payManyTx([CLEAN, BLOCKED])
    const simulated = rpc.calls.some(
      (c) => c.method === 'eth_call' && (c.params[0] as { data?: string }).data === tx.data,
    )
    expect(simulated).toBe(true)
  })

  it('withPreflight still stops a batch from a blocked payer', async () => {
    const rpc = fakeArc({ blocked: [SENDER] })
    const client = createPublicClient({ transport: custom(rpc.provider, { retryCount: 0 }) })
    const wallet = {
      account: { address: SENDER },
      sendTransaction: async () => '0xhash' as Hex,
    } as unknown as WalletClient
    await expect(withPreflight(wallet, client).sendTransaction(payManyTx([CLEAN]) as never)).rejects.toBeInstanceOf(
      PreflightError,
    )
  })
})

describe('parsePayoutLogs', () => {
  const log = (eventName: 'Paid' | 'Skipped', args: Record<string, unknown>, data: Hex, address: string = PREFLIGHT_PAYOUT_ADDRESS) => ({
    address,
    topics: encodeEventTopics({ abi: PREFLIGHT_PAYOUT_ABI, eventName, args } as never) as string[],
    data,
  })

  it('collects paid and skipped payees with reason codes, ignoring other contracts', () => {
    const logs = [
      log('Paid', { ref: REF, payer: SENDER, payee: CLEAN }, encodeAbiParameters([{ type: 'uint256' }], [ONE])),
      log(
        'Skipped',
        { ref: REF, payer: SENDER, payee: BLOCKED },
        encodeAbiParameters([{ type: 'uint256' }, { type: 'uint8' }, { type: 'string' }], [2n * ONE, 1, 'Blocked address']),
      ),
      log(
        'Skipped',
        { ref: REF, payer: SENDER, payee: ZERO },
        encodeAbiParameters([{ type: 'uint256' }, { type: 'uint8' }, { type: 'string' }], [3n * ONE, 2, 'Zero address not allowed']),
      ),
      log('Paid', { ref: REF, payer: SENDER, payee: CLEAN2 }, encodeAbiParameters([{ type: 'uint256' }], [ONE]), CLEAN),
      { address: PREFLIGHT_PAYOUT_ADDRESS, topics: [`0x${'99'.repeat(32)}`], data: '0x' },
    ]

    expect(parsePayoutLogs(logs)).toEqual({
      ref: REF,
      paid: [{ payee: CLEAN, amount: ONE }],
      skipped: [
        { payee: BLOCKED, amount: 2n * ONE, reasonCode: 'BLOCKLIST', detail: 'Blocked address' },
        { payee: ZERO, amount: 3n * ONE, reasonCode: 'ZERO_ADDRESS', detail: 'Zero address not allowed' },
      ],
      paidValue: ONE,
      refundedValue: 5n * ONE,
    })
  })
})

describe('fetchPayoutStats', () => {
  it('decodes the counters', async () => {
    const transport: RpcTransport = {
      request: async () =>
        encodeFunctionResult({ abi: PREFLIGHT_PAYOUT_ABI, functionName: 'stats', result: [3n, 7n, 2n, 7n * ONE, 2n * ONE] }),
    }
    expect(await fetchPayoutStats(transport)).toEqual({
      batches: 3n,
      paidCount: 7n,
      skippedCount: 2n,
      paidValue: 7n * ONE,
      protectedValue: 2n * ONE,
    })
  })

  it('null when the contract is not deployed (empty return data)', async () => {
    expect(await fetchPayoutStats({ request: async () => '0x' })).toBeNull()
  })
})
