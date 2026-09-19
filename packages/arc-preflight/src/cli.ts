/**
 * cli.ts
 *
 *   npx arc-preflight <recipient> [--from 0x..] [--rpc url] [--chain mainnet|testnet]
 *                                 [--value <wei>] [--data 0x..] [--json]
 *
 * Prints SAFE / BLOCKED, reasonCode, layer, sanctions hit and gas estimate.
 * Default RPC is the public Arc mainnet endpoint. No API key required.
 */

import { probe } from './probe.js'
import { httpTransport } from './transport.js'
import { checkSanctions, sanctionsVersion } from './sanctions.js'
import {
  ARC_MAINNET_RPC_URL,
  ARC_TESTNET_RPC_URL,
  MIN_BASE_FEE_WEI,
} from './constants.js'
import type { Address, Hex } from 'viem'

type Args = {
  recipient?: string
  from: string
  rpc?: string
  chain: 'mainnet' | 'testnet'
  value?: bigint
  data?: string
  json: boolean
  help: boolean
}

const DEFAULT_FROM = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

function parseArgs(argv: string[]): Args {
  const args: Args = { from: DEFAULT_FROM, chain: 'mainnet', json: false, help: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    switch (a) {
      case '--from': args.from = next(); break
      case '--rpc': args.rpc = next(); break
      case '--chain': {
        const c = next()
        if (c !== 'mainnet' && c !== 'testnet') throw new Error(`--chain must be mainnet or testnet, got "${c}"`)
        args.chain = c
        break
      }
      case '--value': args.value = BigInt(next()); break
      case '--data': args.data = next(); break
      case '--json': args.json = true; break
      case '-h':
      case '--help': args.help = true; break
      default:
        if (a.startsWith('-')) throw new Error(`Unknown flag: ${a}`)
        if (!args.recipient) args.recipient = a
        else throw new Error(`Unexpected argument: ${a}`)
    }
  }
  return args
}

const USAGE = `arc-preflight — will this USDC transfer revert on Arc?

Usage:
  npx arc-preflight <recipient> [options]

Options:
  --from <address>        Sender address (default: a zero-balance test account)
  --rpc <url>             JSON-RPC endpoint (default: public Arc mainnet)
  --chain mainnet|testnet Pick the public RPC for a chain (default: mainnet)
  --value <wei>           Native value to simulate, 18 decimals (default: 1)
  --data <hex>            Calldata to decode (ERC-20 transfer, Memo, Multicall3From)
  --json                  Print the raw result as JSON
  -h, --help              Show this help
`

function isAddress(s: string | undefined): s is Address {
  return !!s && /^0x[0-9a-fA-F]{40}$/.test(s)
}

function formatUsdc(wei: bigint): string {
  const whole = wei / 10n ** 18n
  const frac = (wei % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole.toString()
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  let args: Args
  try {
    args = parseArgs(argv)
  } catch (err) {
    console.error((err as Error).message)
    console.error(USAGE)
    return 2
  }

  if (args.help || !args.recipient) {
    console.log(USAGE)
    return args.help ? 0 : 2
  }
  if (!isAddress(args.recipient)) {
    console.error(`Invalid recipient address: ${args.recipient}`)
    return 2
  }
  if (!isAddress(args.from)) {
    console.error(`Invalid --from address: ${args.from}`)
    return 2
  }

  const rpc = args.rpc ?? (args.chain === 'testnet' ? ARC_TESTNET_RPC_URL : ARC_MAINNET_RPC_URL)
  const transport = httpTransport(rpc)

  const result = await probe(args.from, args.recipient, transport, {
    simulatedValue: args.value,
    data: args.data as Hex | undefined,
  })

  const sanctionsHit = checkSanctions(args.recipient) || checkSanctions(args.from)
  const gasCostWei = result.gasEstimate * MIN_BASE_FEE_WEI

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          ...result,
          gasEstimate: result.gasEstimate.toString(),
          estimatedGasCostUsdc: formatUsdc(gasCostWei),
          sanctions: { version: sanctionsVersion, hit: sanctionsHit },
          rpc,
        },
        null,
        2,
      ),
    )
    return result.safe ? 0 : 1
  }

  const badge = result.safe ? 'SAFE' : 'BLOCKED'
  console.log(`\n${badge}  ${args.recipient}`)
  console.log(`  from:        ${args.from}`)
  console.log(`  rpc:         ${rpc}`)
  if (!result.safe) {
    console.log(`  reason:      ${result.revertReason}`)
    console.log(`  reasonCode:  ${result.reasonCode}`)
  }
  console.log(`  layer:       ${result.layer ?? '-'}`)
  console.log(`  sanctions:   OFAC SDN ${sanctionsVersion} — ${sanctionsHit ? 'HIT' : 'miss'}`)
  console.log(`  gasEstimate: ${result.gasEstimate.toString()} gas (~${formatUsdc(gasCostWei)} USDC at 20 Gwei)`)
  if (result.recipientsChecked && result.recipientsChecked.length > 1) {
    console.log(`  checked:     ${result.recipientsChecked.join(', ')}`)
  }
  if (!result.safe) {
    console.log(`\n  Submitting this would have cost ~${formatUsdc(gasCostWei)} USDC in gas and reverted.`)
  }
  console.log()
  return result.safe ? 0 : 1
}
