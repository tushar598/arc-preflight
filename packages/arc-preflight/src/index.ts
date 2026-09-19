/**
 * index.ts
 *
 * Public API surface for the arc-preflight package.
 *
 * @example
 * ```ts
 * import { preflight, withPreflight, PreflightError } from 'arc-preflight'
 * import { preflightEthers, withPreflightEthers } from 'arc-preflight'
 * import { checkSanctions } from 'arc-preflight'
 * import type { PreflightResult } from 'arc-preflight'
 * ```
 */

// Viem adapter (primary)
export { preflight, withPreflight } from './adapters/viem.js'

// Ethers v6 adapter
export { preflightEthers, withPreflightEthers } from './adapters/ethers.js'

// Types
export type { PreflightResult, PreflightOptions, Address } from './types.js'

// Errors
export { PreflightError } from './errors.js'

// Sanctions data (offline OFAC check)
export { checkSanctions, sanctionsVersion, sanctionsCount } from './sanctions.js'

// Constants — exported for callers who want to reference Arc addresses
export {
  ARC_MAINNET_CHAIN_ID,
  ARC_TESTNET_CHAIN_ID,
  ARC_MAINNET_RPC_URL,
  ARC_TESTNET_RPC_URL,
  ARC_MAINNET_EXPLORER_URL,
  ARC_TESTNET_EXPLORER_URL,
  USDC_ADDRESS,
  MEMO_ADDRESS,
  MULTICALL3FROM_ADDRESS,
  TESTNET_BLOCKLISTED_ADDRESS,
  MAINNET_DEMO_BLOCKED_ADDRESS,
  MIN_BASE_FEE_WEI,
  USDC_TRANSFER_GAS_ESTIMATE,
} from './constants.js'
