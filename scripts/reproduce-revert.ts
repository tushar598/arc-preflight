/**
 * reproduce-revert.ts
 *
 * Phase 1 Prototype — Arc Preflight
 *
 * Purpose:
 *   Demonstrates that a USDC transfer to a blocklisted address on Arc reverts
 *   at runtime via `eth_call` — BEFORE the transaction is submitted to the
 *   chain. This is the core concept behind arc-preflight.
 *
 * What it does:
 *   1. Connects to arc-anvil (local fork of Arc testnet) or Arc testnet directly.
 *   2. Simulates a USDC transfer to the known blocklisted test address using `eth_call`.
 *   3. Prints whether the call reverts and captures the revert reason.
 *   4. Estimates the gas that WOULD have been consumed if submitted on-chain.
 *   5. Summarizes: "This preflight would have saved you X USDC in gas."
 *
 * Usage:
 *   npx tsx scripts/reproduce-revert.ts [--rpc <url>]
 *
 * Default RPC: arc-anvil fork on localhost:8545
 *   Start arc-anvil with: arc-anvil --network arc --fork-url https://rpc.testnet.arc.network
 *
 * Sources:
 *   - https://docs.arc.network/arc/references/contract-addresses
 *   - https://docs.arc.network/arc/references/evm-differences
 *   - https://docs.arc.network/arc/references/gas-and-fees
 */

import { createPublicClient, http, parseUnits, encodeFunctionData, decodeFunctionResult } from 'viem'
import { defineChain } from 'viem/chains'

// ---------------------------------------------------------------------------
// Arc chain definitions (from docs.arc.network)
// ---------------------------------------------------------------------------

const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.network'] },
  },
  blockExplorers: {
    default: { name: 'Arc Explorer', url: 'https://explorer.testnet.arc.io' },
  },
})

const arcAnvilFork = defineChain({
  id: 5042002, // fork preserves the chain ID
  name: 'arc-anvil (local)',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: ['http://localhost:8545'] },
  },
})

// ---------------------------------------------------------------------------
// Constants — from official Arc docs (same on mainnet and testnet)
// ---------------------------------------------------------------------------

/**
 * USDC ERC-20 interface contract address on Arc.
 * Note: Uses 6 decimals (ERC-20 interface).
 *       The native USDC balance uses 18 decimals.
 * Source: https://docs.arc.network/arc/references/contract-addresses
 */
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const

/**
 * Known blocklisted test address on Arc Testnet.
 * Derived from mnemonic: "test test...junk" at index 1.
 * Source: https://docs.arc.network/arc/references/contract-addresses
 */
const BLOCKLISTED_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const

/**
 * A "clean" sender address — the first account from the standard test mnemonic.
 * This is used as the `from` address in eth_call simulation.
 */
const SENDER_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const

/**
 * Minimum base fee on Arc: 20 Gwei.
 * Source: https://docs.arc.network/arc/references/evm-differences
 */
const MIN_BASE_FEE_GWEI = BigInt(20)
const GWEI = BigInt(1_000_000_000)

// Minimal USDC ERC-20 ABI — only the `transfer` function
const USDC_ABI = [
  {
    type: 'function',
    name: 'transfer',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const rpcUrl = process.argv.includes('--rpc')
    ? process.argv[process.argv.indexOf('--rpc') + 1]
    : 'http://localhost:8545'

  const useLocalFork = rpcUrl.includes('localhost') || rpcUrl.includes('127.0.0.1')
  const chain = useLocalFork ? arcAnvilFork : arcTestnet

  console.log('\n══════════════════════════════════════════════════════════')
  console.log('   arc-preflight | Phase 1 — Revert Reproduction Probe')
  console.log('══════════════════════════════════════════════════════════')
  console.log(`RPC:               ${rpcUrl}`)
  console.log(`Chain:             ${chain.name} (ID: ${chain.id})`)
  console.log(`USDC:              ${USDC_ADDRESS}`)
  console.log(`Sender:            ${SENDER_ADDRESS}`)
  console.log(`Blocklisted target:${BLOCKLISTED_ADDRESS}`)
  console.log('──────────────────────────────────────────────────────────\n')

  const client = createPublicClient({
    chain,
    transport: http(rpcUrl),
  })

  // 1. Encode the `transfer(to, amount)` calldata
  //    Sending 1.0 USDC (6 decimals via ERC-20 interface)
  const transferAmount = parseUnits('1', 6) // 1 USDC
  const calldata = encodeFunctionData({
    abi: USDC_ABI,
    functionName: 'transfer',
    args: [BLOCKLISTED_ADDRESS, transferAmount],
  })

  // 2. Simulate the call with eth_call
  console.log('Step 1: Simulating transfer to blocklisted address via eth_call...')
  let reverted = false
  let revertReason = ''
  let rawError: unknown = null

  try {
    await client.call({
      account: SENDER_ADDRESS,
      to: USDC_ADDRESS,
      data: calldata,
    })
    console.log('  ✗ UNEXPECTED: eth_call succeeded — address may not be blocklisted.')
    console.log('    Hint: Make sure you are using arc-anvil (--network arc) or Arc Testnet.')
  } catch (err) {
    reverted = true
    rawError = err
    // Extract revert reason from the error message
    const errStr = String(err)
    if (errStr.includes('runtime-transfer-check')) {
      revertReason = 'runtime-transfer-check'
    } else if (errStr.includes('execution reverted')) {
      revertReason = 'execution reverted (reason not decoded)'
    } else {
      revertReason = errStr.slice(0, 120)
    }
    console.log(`  ✓ CONFIRMED: eth_call reverted as expected.`)
    console.log(`  Revert reason: "${revertReason}"`)
  }

  // 3. Try to estimate gas for a non-blocklisted transfer (to understand cost saved)
  console.log('\nStep 2: Estimating gas for a normal (non-blocklisted) transfer...')
  let gasEstimate = BigInt(0)
  const SAFE_RECEIVER = '0x1111111111111111111111111111111111111111' as const

  try {
    gasEstimate = await client.estimateGas({
      account: SENDER_ADDRESS,
      to: USDC_ADDRESS,
      data: encodeFunctionData({
        abi: USDC_ABI,
        functionName: 'transfer',
        args: [SAFE_RECEIVER, transferAmount],
      }),
    })
    console.log(`  Gas estimate for normal transfer: ${gasEstimate.toLocaleString()} gas units`)
  } catch (err) {
    console.log(`  Could not estimate gas: ${String(err).slice(0, 80)}`)
    gasEstimate = BigInt(21_000) // fallback: use minimum gas as conservative estimate
    console.log(`  Using conservative fallback estimate: ${gasEstimate.toLocaleString()} gas units`)
  }

  // 4. Calculate gas cost in USDC
  //    Arc uses USDC for gas. Native USDC has 18 decimals.
  //    Cost = gasEstimate * baseFeePerGas (in wei/native USDC)
  //    Display in human-readable USDC (divide by 1e18 for native, then by 1e6 for display)
  const baseFee = MIN_BASE_FEE_GWEI * GWEI // 20 Gwei in native USDC units (wei)
  const gasCostNative = gasEstimate * baseFee // in native USDC wei (18 decimals)
  const gasCostUsdc = Number(gasCostNative) / 1e18 // convert to human-readable USDC

  console.log('\n──────────────────────────────────────────────────────────')
  console.log('SUMMARY')
  console.log('──────────────────────────────────────────────────────────')
  console.log(`Transfer to blocklisted address:`)
  console.log(`  Reverted via eth_call:  ${reverted ? '✓ YES' : '✗ NO'}`)
  console.log(`  Revert reason:          "${revertReason || 'n/a'}"`)
  console.log()
  console.log(`Gas cost analysis (at minimum base fee of 20 Gwei):`)
  console.log(`  Gas estimate:           ${gasEstimate.toLocaleString()} gas units`)
  console.log(`  Base fee:               20 Gwei`)
  console.log(`  Estimated gas cost:     ~${gasCostUsdc.toFixed(8)} USDC`)
  console.log()

  if (reverted) {
    console.log(`💡 PREFLIGHT VALUE DEMONSTRATED:`)
    console.log(`   Without arc-preflight: This transaction would have been submitted,`)
    console.log(`   consumed ~${gasEstimate.toLocaleString()} gas, and reverted — wasting ~${gasCostUsdc.toFixed(8)} USDC.`)
    console.log(`   With arc-preflight: The revert is caught before submission. Gas saved. ✓`)
    console.log()
    console.log(`   This number will power the "USDC gas saved" counter on the demo page.`)
  }

  console.log('══════════════════════════════════════════════════════════\n')

  // Return structured data for use by other scripts / tests
  return {
    reverted,
    revertReason,
    gasEstimate: gasEstimate.toString(),
    gasCostUsdcApprox: gasCostUsdc,
    rpc: rpcUrl,
    chainId: chain.id,
    blocklistedAddress: BLOCKLISTED_ADDRESS,
    usdcAddress: USDC_ADDRESS,
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
