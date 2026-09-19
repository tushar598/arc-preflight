/**
 * examples/agent/run.ts
 *
 * An autonomous payout agent on Arc Testnet, guarded by arc-preflight.
 *
 *   1. Screens the whole payee list up front with `preflightMany()`.
 *   2. Pays each clean worker through `withPreflight()` — a wrapped wallet
 *      client that re-checks every `sendTransaction`, including ones that move
 *      USDC through the ERC-20 interface or a Multicall3From batch with
 *      `value: 0`.
 *   3. Never stops on a blocked payee: it logs the reason code and layer and
 *      keeps going.
 *
 * Run:  npm install && npm start
 * The wallet is random and unfunded, so clean sends fail with "insufficient
 * funds" at the RPC — which is the point: the blocked ones never get that far.
 */

import { createWalletClient, createPublicClient, http, formatEther, encodeFunctionData, defineChain } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import {
  withPreflight,
  preflightMany,
  PreflightError,
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_RPC_URL,
  TESTNET_BLOCKLISTED_ADDRESS,
  MIN_BASE_FEE_WEI,
  USDC_ADDRESS,
  MULTICALL3FROM_ADDRESS,
  ERC20_TRANSFER_ABI,
  MULTICALL3FROM_ABI,
} from 'arc-preflight'

const arcTestnet = defineChain({
  id: ARC_TESTNET_CHAIN_ID,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [ARC_TESTNET_RPC_URL] } },
})

// 1. The agent's environment — a throwaway key, zero balance.
const account = privateKeyToAccount(generatePrivateKey())
const publicClient = createPublicClient({ chain: arcTestnet, transport: http() })
const wallet = withPreflight(createWalletClient({ account, chain: arcTestnet, transport: http() }), publicClient)

console.log(`Agent wallet ${account.address}\n`)

// 2. Payees. One is on the testnet blocklist; one is paid via ERC-20 calldata;
//    one batch goes through Multicall3From with a blocked recipient hidden inside.
const WORKERS = [
  { id: 'worker-1', to: '0x1234567890123456789012345678901234567890', how: 'native' },
  { id: 'worker-2', to: TESTNET_BLOCKLISTED_ADDRESS, how: 'native' },
  { id: 'worker-3', to: '0x9999999999999999999999999999999999999999', how: 'erc20' },
  { id: 'batch-4', to: MULTICALL3FROM_ADDRESS, how: 'aggregate3' },
] as const

const PAYOUT_WEI = 1_000_000_000_000_000n // 0.001 USDC (native, 18 decimals)
const PAYOUT_ERC20 = 1_000n // 0.001 USDC (ERC-20, 6 decimals)
const gasCostUsdc = (gas: bigint) => formatEther(gas * MIN_BASE_FEE_WEI)

function buildTx(w: (typeof WORKERS)[number]) {
  switch (w.how) {
    case 'native':
      return { to: w.to, value: PAYOUT_WEI }
    case 'erc20':
      return {
        to: USDC_ADDRESS,
        value: 0n,
        data: encodeFunctionData({ abi: ERC20_TRANSFER_ABI, functionName: 'transfer', args: [w.to, PAYOUT_ERC20] }),
      }
    case 'aggregate3':
      return {
        to: MULTICALL3FROM_ADDRESS,
        value: 0n,
        data: encodeFunctionData({
          abi: MULTICALL3FROM_ABI,
          functionName: 'aggregate3',
          args: [[
            { target: USDC_ADDRESS, allowFailure: false, callData: encodeFunctionData({ abi: ERC20_TRANSFER_ABI, functionName: 'transfer', args: ['0x1234567890123456789012345678901234567890', PAYOUT_ERC20] }) },
            { target: USDC_ADDRESS, allowFailure: false, callData: encodeFunctionData({ abi: ERC20_TRANSFER_ABI, functionName: 'transfer', args: [TESTNET_BLOCKLISTED_ADDRESS, PAYOUT_ERC20] }) },
          ]],
        }),
      }
  }
}

async function main() {
  // 3. Screen the direct payees in one go before touching the wallet.
  const direct = WORKERS.filter((w) => w.how !== 'aggregate3').map((w) => w.to)
  const screen = await preflightMany(account.address, direct, publicClient)
  console.log(`Screened ${direct.length} payees: ${screen.safeCount} clear, ${screen.blockedCount} blocked`)
  screen.results.forEach((r, i) => {
    console.log(`  ${direct[i]}  ${r.safe ? 'clear' : `BLOCKED ${r.reasonCode} via ${r.layer}`}`)
  })
  console.log()

  // 4. Pay. The guard on `wallet` re-checks each tx, calldata included.
  for (const w of WORKERS) {
    const tx = buildTx(w)
    process.stdout.write(`${w.id.padEnd(9)} ${w.how.padEnd(10)} `)
    try {
      const hash = await wallet.sendTransaction({ ...tx, account, chain: arcTestnet })
      console.log(`sent ${hash}`)
    } catch (err) {
      if (err instanceof PreflightError) {
        const gas = err.result?.gasEstimate ?? 34_000n
        console.log(`stopped before broadcast — ${err.reasonCode} via ${err.layer}: ${err.revertReason}`)
        console.log(`${''.padEnd(20)} gas not spent ≈ ${gasCostUsdc(gas)} USDC${err.result?.recipientsChecked?.length ? `, checked ${err.result.recipientsChecked.length} recipient(s)` : ''}`)
      } else {
        // Unfunded wallet: clean sends are rejected by the RPC. A real agent
        // would retry or alert; the blocked ones above never reached this line.
        console.log(`rpc rejected (expected, wallet has no balance): ${(err as Error).message.split('\n')[0]}`)
      }
    }
  }

  console.log('\nPayout loop finished.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
