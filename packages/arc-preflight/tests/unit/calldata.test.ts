import { describe, it, expect } from 'vitest'
import { encodeFunctionData } from 'viem'
import {
  decodeTransferIntents,
  ERC20_TRANSFER_ABI,
  MEMO_ABI,
  MULTICALL3FROM_ABI,
  USDC_ADDRESS,
  MEMO_ADDRESS,
  MULTICALL3FROM_ADDRESS,
} from '../../src/index.js'
import { SENDER, CLEAN, CLEAN2, BLOCKED } from '../helpers/fakeArc.js'

const transfer = (to: `0x${string}`, amount = 1_000_000n) =>
  encodeFunctionData({ abi: ERC20_TRANSFER_ABI, functionName: 'transfer', args: [to, amount] })

describe('decodeTransferIntents', () => {
  it('native value only', () => {
    const intents = decodeTransferIntents({ from: SENDER, to: CLEAN, value: 5n })
    expect(intents).toEqual([{ from: SENDER, to: CLEAN, value: 5n, via: 'native' }])
  })

  it('value 0 with no data → nothing', () => {
    expect(decodeTransferIntents({ from: SENDER, to: CLEAN, value: 0n })).toEqual([])
  })

  it('value 0 with undecodable data → nothing (does not throw)', () => {
    expect(decodeTransferIntents({ from: SENDER, to: CLEAN, value: 0n, data: '0xdeadbeef00' })).toEqual([])
  })

  it('ERC-20 transfer(to, value)', () => {
    const intents = decodeTransferIntents({ from: SENDER, to: USDC_ADDRESS, value: 0n, data: transfer(BLOCKED) })
    expect(intents).toEqual([{ from: SENDER, to: BLOCKED, value: 1_000_000n, via: 'erc20' }])
  })

  it('ERC-20 transferFrom(from, to, value) attributes the sender to `from`', () => {
    const data = encodeFunctionData({ abi: ERC20_TRANSFER_ABI, functionName: 'transferFrom', args: [CLEAN2, BLOCKED, 7n] })
    const intents = decodeTransferIntents({ from: SENDER, to: USDC_ADDRESS, value: 0n, data })
    expect(intents).toEqual([{ from: CLEAN2, to: BLOCKED, value: 7n, via: 'erc20' }])
  })

  it('EIP-3009 transferWithAuthorization (both variants) and receiveWithAuthorization', () => {
    const common = [CLEAN2, BLOCKED, 9n, 0n, 2n ** 64n, `0x${'ab'.repeat(32)}`] as const
    const vrs = encodeFunctionData({
      abi: ERC20_TRANSFER_ABI,
      functionName: 'transferWithAuthorization',
      args: [...common, 27, `0x${'01'.repeat(32)}`, `0x${'02'.repeat(32)}`],
    })
    const packed = encodeFunctionData({
      abi: ERC20_TRANSFER_ABI,
      functionName: 'transferWithAuthorization',
      args: [...common, `0x${'03'.repeat(65)}`],
    })
    const recv = encodeFunctionData({
      abi: ERC20_TRANSFER_ABI,
      functionName: 'receiveWithAuthorization',
      args: [...common, 27, `0x${'01'.repeat(32)}`, `0x${'02'.repeat(32)}`],
    })
    for (const data of [vrs, packed, recv]) {
      const intents = decodeTransferIntents({ from: SENDER, to: USDC_ADDRESS, value: 0n, data })
      expect(intents).toEqual([{ from: CLEAN2, to: BLOCKED, value: 9n, via: 'erc20' }])
    }
  })

  it('Memo.memo(target, data, …) unwraps to the inner recipient with the ORIGINAL sender', () => {
    const data = encodeFunctionData({
      abi: MEMO_ABI,
      functionName: 'memo',
      args: [USDC_ADDRESS, transfer(BLOCKED), `0x${'11'.repeat(32)}`, '0x01'],
    })
    const intents = decodeTransferIntents({ from: SENDER, to: MEMO_ADDRESS, value: 0n, data })
    expect(intents).toEqual([{ from: SENDER, to: BLOCKED, value: 1_000_000n, via: 'memo' }])
  })

  it('Multicall3From.aggregate3 yields one intent per inner transfer', () => {
    const data = encodeFunctionData({
      abi: MULTICALL3FROM_ABI,
      functionName: 'aggregate3',
      args: [[
        { target: USDC_ADDRESS, allowFailure: false, callData: transfer(CLEAN) },
        { target: USDC_ADDRESS, allowFailure: false, callData: transfer(CLEAN2, 5n) },
        { target: USDC_ADDRESS, allowFailure: true, callData: transfer(BLOCKED) },
      ]],
    })
    const intents = decodeTransferIntents({ from: SENDER, to: MULTICALL3FROM_ADDRESS, value: 0n, data })
    expect(intents.map((i) => i.to)).toEqual([CLEAN, CLEAN2, BLOCKED])
    expect(intents.every((i) => i.via === 'multicall3from' && i.from === SENDER)).toBe(true)
  })

  it('Multicall3From.aggregate / tryAggregate / blockAndAggregate / tryBlockAndAggregate', () => {
    const calls = [{ target: USDC_ADDRESS, callData: transfer(BLOCKED) }]
    const variants = [
      encodeFunctionData({ abi: MULTICALL3FROM_ABI, functionName: 'aggregate', args: [calls] }),
      encodeFunctionData({ abi: MULTICALL3FROM_ABI, functionName: 'tryAggregate', args: [false, calls] }),
      encodeFunctionData({ abi: MULTICALL3FROM_ABI, functionName: 'blockAndAggregate', args: [calls] }),
      encodeFunctionData({ abi: MULTICALL3FROM_ABI, functionName: 'tryBlockAndAggregate', args: [true, calls] }),
    ]
    for (const data of variants) {
      const intents = decodeTransferIntents({ from: SENDER, to: MULTICALL3FROM_ADDRESS, value: 0n, data })
      expect(intents).toEqual([{ from: SENDER, to: BLOCKED, value: 1_000_000n, via: 'multicall3from' }])
    }
  })

  it('nested: Multicall3From → Memo → USDC.transfer', () => {
    const memo = encodeFunctionData({
      abi: MEMO_ABI,
      functionName: 'memo',
      args: [USDC_ADDRESS, transfer(BLOCKED), `0x${'11'.repeat(32)}`, '0x'],
    })
    const data = encodeFunctionData({
      abi: MULTICALL3FROM_ABI,
      functionName: 'aggregate3',
      args: [[{ target: MEMO_ADDRESS, allowFailure: false, callData: memo }]],
    })
    const intents = decodeTransferIntents({ from: SENDER, to: MULTICALL3FROM_ADDRESS, value: 0n, data })
    expect(intents).toEqual([{ from: SENDER, to: BLOCKED, value: 1_000_000n, via: 'memo' }])
  })

  it('native value + calldata yields both, deduplicated by (from,to)', () => {
    const intents = decodeTransferIntents({ from: SENDER, to: USDC_ADDRESS, value: 3n, data: transfer(USDC_ADDRESS) })
    expect(intents).toEqual([{ from: SENDER, to: USDC_ADDRESS, value: 3n, via: 'native' }])
  })
})
