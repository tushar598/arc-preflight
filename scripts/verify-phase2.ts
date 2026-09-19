import { createPublicClient, http } from 'viem'
import {
  preflight,
  withPreflight,
  PreflightError,
  TESTNET_BLOCKLISTED_ADDRESS,
  ARC_TESTNET_RPC_URL,
} from '../packages/arc-preflight/src/index.js'

async function runTests() {
  console.log('--- Starting Preflight Live UAT Verification ---')
  const client = createPublicClient({
    transport: http(ARC_TESTNET_RPC_URL),
  })

  const sender = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
  const cleanRecipient = '0x1111111111111111111111111111111111111111'
  const blocklistedRecipient = TESTNET_BLOCKLISTED_ADDRESS

  // Test 1: Preflight on clean recipient
  console.log('\n[Test 1] Testing clean recipient:', cleanRecipient)
  const cleanResult = await preflight(sender, cleanRecipient, client)
  console.log('Clean recipient result:', cleanResult)

  // Test 2: Preflight on blocklisted recipient
  console.log('\n[Test 2] Testing blocklisted recipient:', blocklistedRecipient)
  const blocklistedResult = await preflight(sender, blocklistedRecipient, client)
  console.log('Blocklisted recipient result:', blocklistedResult)

  // Test 3: withPreflight proxy behavior
  console.log('\n[Test 3] Testing withPreflight() proxy')
  let sendTxCalled = false
  const mockWalletClient = {
    account: sender,
    sendTransaction: async (params: any) => {
      sendTxCalled = true
      return '0xmockhash'
    },
  } as any

  const guarded = withPreflight(mockWalletClient, client)
  console.log('Guarded client __preflight tag:', (guarded as any).__preflight)

  let threwExpected = false
  try {
    await guarded.sendTransaction({
      to: blocklistedRecipient,
      value: 1n,
    })
  } catch (err) {
    if (err instanceof PreflightError) {
      console.log('Successfully caught PreflightError:', err.message)
      console.log('Revert reason:', err.revertReason)
      threwExpected = true
    } else {
      console.error('Unexpected error type thrown:', err)
    }
  }

  // Test 4: Guarded client allowing clean send
  let cleanSendSucceeded = false
  try {
    const hash = await guarded.sendTransaction({
      to: cleanRecipient,
      value: 1n,
    })
    console.log('Clean send succeeded with hash:', hash)
    cleanSendSucceeded = (hash === '0xmockhash')
  } catch (err) {
    console.error('Clean send unexpectedly failed:', err)
  }

  console.log('\n--- UAT Verification Summary ---')
  console.log('Test 1 (Clean is safe):', cleanResult.safe === true ? 'PASS' : 'FAIL')
  console.log('Test 2 (Blocklist is unsafe):', blocklistedResult.safe === false ? 'PASS' : 'FAIL')
  console.log('Test 3 (withPreflight blocks):', threwExpected === true ? 'PASS' : 'FAIL')
  console.log('Test 4 (withPreflight passes safe):', cleanSendSucceeded === true ? 'PASS' : 'FAIL')

  if (
    cleanResult.safe === true &&
    blocklistedResult.safe === false &&
    threwExpected &&
    cleanSendSucceeded
  ) {
    console.log('\nALL UAT CHECKS PASSED!')
  } else {
    console.error('\nSOME UAT CHECKS FAILED')
    process.exit(1)
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err)
  process.exit(1)
})
