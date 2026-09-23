/**
 * index.ts
 *
 * Public API surface for the arc-preflight package.
 *
 * @example
 * ```ts
 * import { preflight, preflightMany, withPreflight, PreflightError } from 'arc-preflight'
 * import { preflightEthers, withPreflightEthers } from 'arc-preflight'
 * import { checkSanctions, createBlocklistCache, decodeTransferIntents } from 'arc-preflight'
 * import { planPayout, parsePayoutLogs, PREFLIGHT_PAYOUT_ADDRESS } from 'arc-preflight'
 * import type { PreflightResult, PreflightReasonCode } from 'arc-preflight'
 * ```
 */

// Viem adapter (primary)
export { preflight, preflightMany, withPreflight, planPayout, readPayoutStats } from './adapters/viem.js'

// Ethers v6 adapter
export {
  preflightEthers,
  preflightManyEthers,
  withPreflightEthers,
  planPayoutEthers,
  readPayoutStatsEthers,
} from './adapters/ethers.js'

// Transport-level API (bring your own JSON-RPC)
export { probe, runPreflight, simulateNativeSend, estimateNativeSendGas, isBlacklisted } from './probe.js'
export { runPreflightMany } from './batch.js'
export type { PreflightManyOptions } from './batch.js'
export { httpTransport, transportFromViem, transportFromEthers } from './transport.js'

// PreflightPayout (on-chain batch payouts that skip and refund blocked payees)
export { runPlanPayout, parsePayoutLogs, fetchPayoutStats } from './payout.js'
export type { Payee, PayoutPlan, PayoutPlanEntry, PlanPayoutOptions, PayoutReceipt, PayoutStats } from './payout.js'

// Calldata decoding
export { decodeTransferIntents } from './calldata.js'
export type { TxLike } from './calldata.js'

// Revert helpers
export { extractRevertReason, classifyRevert, isPrecompileAddress, decodeErrorString } from './revert.js'

// Types
export type {
  PreflightResult,
  PreflightOptions,
  PreflightReasonCode,
  PreflightLayer,
  PreflightManyResult,
  BlocklistCache,
  RpcTransport,
  TransferIntent,
  Address,
  Hex,
} from './types.js'

// Errors
export { PreflightError } from './errors.js'

// Sanctions data (offline OFAC SDN check)
export { checkSanctions, sanctionsVersion, sanctionsCount, sanctionsScope } from './sanctions.js'

// Cache (local event cache with backfill)
export { createBlocklistCache } from './cache.js'
export type { BlocklistCacheOptions } from './cache.js'

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
  PREFLIGHT_PAYOUT_ADDRESS,
  SYSTEM_EMITTER_ADDRESS,
  NATIVE_COIN_AUTHORITY_PRECOMPILE_ADDRESS,
  NATIVE_COIN_CONTROL_PRECOMPILE_ADDRESS,
  CALLFROM_PRECOMPILE_ADDRESS,
  ARC_PRECOMPILE_ADDRESSES,
  TESTNET_BLOCKLISTED_ADDRESS,
  MAINNET_DEMO_BLOCKED_ADDRESS,
  ZERO_ADDRESS,
  MIN_BASE_FEE_WEI,
  USDC_TRANSFER_GAS_ESTIMATE,
  USDC_EVENTS_ABI,
  USDC_BLACKLIST_ABI,
  ERC20_TRANSFER_ABI,
  MEMO_ABI,
  MULTICALL3FROM_ABI,
  PREFLIGHT_PAYOUT_ABI,
} from './constants.js'
