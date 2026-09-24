/**
 * payout.live.test.ts
 *
 * Runs the compiled PreflightPayout bytecode against Arc Testnet's real runtime
 * by injecting it with a stateOverride — no deployment or funded key needed —
 * and checks that planPayout() predicted exactly what the contract does.
 *
 * Needs the forge artifact: `npm run contracts:build` first.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { createPublicClient, decodeFunctionResult, http, type Hex } from 'viem'
import {
  planPayout,
  readPayoutStats,
  TESTNET_BLOCKLISTED_ADDRESS,
  MAINNET_DEMO_BLOCKED_ADDRESS,
  ARC_TESTNET_RPC_URL,
  ARC_MAINNET_RPC_URL,
  PREFLIGHT_PAYOUT_ABI,
  PREFLIGHT_PAYOUT_ADDRESS,
  ZERO_ADDRESS,
} from '../../src/index.js'

const client = createPublicClient({ transport: http(ARC_TESTNET_RPC_URL) })
const mainnet = createPublicClient({ transport: http(ARC_MAINNET_RPC_URL) })

const SENDER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const
const CLEAN = '0x1111111111111111111111111111111111111111' as const
const CLEAN2 = '0x2222222222222222222222222222222222222222' as const
const ECRECOVER = '0x0000000000000000000000000000000000000001' as const

function runtimeCode(): Hex {
  const artifact = fileURLToPath(new URL('../../../../contracts/out/PreflightPayout.sol/PreflightPayout.json', import.meta.url))
  try {
    return JSON.parse(readFileSync(artifact, 'utf8')).deployedBytecode.object as Hex
  } catch {
    throw new Error(`PreflightPayout artifact missing at ${artifact} — run \`npm run contracts:build\``)
  }
}

describe('PreflightPayout — Arc Testnet runtime', () => {
  it('the contract pays and refunds exactly what planPayout() predicted', async () => {
    const payees = [CLEAN, TESTNET_BLOCKLISTED_ADDRESS, ZERO_ADDRESS, ECRECOVER, CLEAN2].map((to, i) => ({
      to,
      amount: BigInt(i + 1) * 1000n,
    }))
    const plan = await planPayout(SENDER, payees, client, { includeSkipped: true })
    expect(plan.pay.map((p) => p.to)).toEqual([CLEAN, CLEAN2])

    const { data } = await client.call({
      account: SENDER,
      to: plan.tx!.to,
      value: plan.tx!.value,
      data: plan.tx!.data,
      stateOverride: [
        { address: SENDER, balance: 10n ** 24n },
        { address: PREFLIGHT_PAYOUT_ADDRESS, code: runtimeCode() },
      ],
    })
    const [paidValue, refundedValue] = decodeFunctionResult({
      abi: PREFLIGHT_PAYOUT_ABI,
      functionName: 'payMany',
      data: data!,
    })

    expect(paidValue).toBe(plan.payValue)
    expect(refundedValue).toBe(plan.skipValue)
  })

  it('readPayoutStats() reads the deployment, or null before it exists', async () => {
    const code = await client.getCode({ address: PREFLIGHT_PAYOUT_ADDRESS })
    const stats = await readPayoutStats(client)
    if (code && code !== '0x') expect(stats).not.toBeNull()
    else expect(stats).toBeNull()
  })
})

describe('PreflightPayout — Arc mainnet runtime', () => {
  it('refunds the OFAC-listed payee and pays the clean one, as planned', async () => {
    const payees = [CLEAN, MAINNET_DEMO_BLOCKED_ADDRESS].map((to) => ({ to, amount: 1000n }))
    const plan = await planPayout(SENDER, payees, mainnet, { includeSkipped: true })
    expect(plan.skip).toMatchObject([{ to: MAINNET_DEMO_BLOCKED_ADDRESS, reasonCode: 'BLOCKLIST', layer: 'sanctions' }])

    // Simulation only: nothing is broadcast, so no transaction ever names the sanctioned address.
    const { data } = await mainnet.call({
      account: SENDER,
      to: plan.tx!.to,
      value: plan.tx!.value,
      data: plan.tx!.data,
      stateOverride: [
        { address: SENDER, balance: 10n ** 24n },
        { address: PREFLIGHT_PAYOUT_ADDRESS, code: runtimeCode() },
      ],
    })
    const [paidValue, refundedValue] = decodeFunctionResult({ abi: PREFLIGHT_PAYOUT_ABI, functionName: 'payMany', data: data! })
    expect([paidValue, refundedValue]).toEqual([plan.payValue, plan.skipValue])
  })
})

