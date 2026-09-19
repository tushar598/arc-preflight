import { 
  createWalletClient, 
  createPublicClient, 
  http, 
  formatEther
} from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import { 
  withPreflight, 
  PreflightError,
  ARC_TESTNET_RPC_URL,
  TESTNET_BLOCKLISTED_ADDRESS,
  MIN_BASE_FEE_WEI,
  USDC_TRANSFER_GAS_ESTIMATE
} from 'arc-preflight'

// 1. Setup the autonomous agent's environment
console.log('🤖 Initializing Agent Middleware Demo...')
const account = privateKeyToAccount(generatePrivateKey())
console.log(`🤖 Agent Wallet Address: ${account.address}\n`)

const publicClient = createPublicClient({ 
  chain: arcTestnet,
  transport: http(ARC_TESTNET_RPC_URL) 
})

const baseWallet = createWalletClient({
  account,
  chain: arcTestnet,
  transport: http(ARC_TESTNET_RPC_URL)
})

// 2. Wrap the agent's wallet with arc-preflight
// This ensures every transaction is simulated for blocklist hits BEFORE it is broadcast
const safeWallet = withPreflight(baseWallet, publicClient)

// 3. Define the payout list (workers)
const WORKERS = [
  { id: 'Worker 1 (Clean)', address: '0x1234567890123456789012345678901234567890' as const },
  { id: 'Worker 2 (Blocked)', address: TESTNET_BLOCKLISTED_ADDRESS as const },
  { id: 'Worker 3 (Clean)', address: '0x9999999999999999999999999999999999999999' as const },
]

const PAYOUT_AMOUNT_WEI = 1000000000000000n // 0.001 USDC

async function runAgent() {
  console.log('💰 Starting Payout Loop...\n')

  for (const worker of WORKERS) {
    console.log(`[Processing] Paying ${worker.id} (${worker.address})...`)

    try {
      // The agent blindly calls sendTransaction.
      // If the address is blocked, arc-preflight intercepts it and throws PreflightError.
      const hash = await safeWallet.sendTransaction({
        to: worker.address,
        value: PAYOUT_AMOUNT_WEI
      })
      
      console.log(`✅ Success! Tx Hash: ${hash}\n`)
    } catch (err: unknown) {
      if (err instanceof PreflightError) {
        // We caught a blocklisted transfer BEFORE broadcasting it!
        const gasCostInWei = USDC_TRANSFER_GAS_ESTIMATE * MIN_BASE_FEE_WEI
        const costUsdc = formatEther(gasCostInWei)

        console.error(`❌ Blocked! Preflight caught a revert: ${err.revertReason}`)
        console.error(`🛡️  Gas Saved: ${costUsdc} USDC (Transaction skipped)`)
        console.log(`➡️  Agent gracefully continuing to next worker...\n`)
      } else {
        // For other types of errors (e.g. actual network issues or insufficient balance),
        // a real agent might retry or halt. Since this is a dummy account with 0 balance,
        // sendTransaction to the clean worker will fail with insufficient funds.
        console.error(`⚠️  RPC Error (expected for 0 balance): ${(err as Error).message.split('\n')[0]}\n`)
      }
    }
  }

  console.log('🏁 Agent payout loop complete.')
}

runAgent().catch(console.error)
