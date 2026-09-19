/**
 * constants.ts
 *
 * Arc chain and contract constants.
 * All values sourced from https://docs.arc.network (official Arc documentation).
 *
 * These are the canonical addresses used throughout the arc-preflight SDK.
 * They are exported so callers can reference them without hardcoding strings.
 */

/** Arc Mainnet chain ID */
export const ARC_MAINNET_CHAIN_ID = 5042 as const

/** Arc Testnet chain ID */
export const ARC_TESTNET_CHAIN_ID = 5042002 as const

/** Arc Mainnet RPC URL */
export const ARC_MAINNET_RPC_URL = 'https://rpc.mainnet.arc.io' as const

/** Arc Testnet RPC URL */
export const ARC_TESTNET_RPC_URL = 'https://rpc.testnet.arc.network' as const

/** Arc Mainnet block explorer URL */
export const ARC_MAINNET_EXPLORER_URL = 'https://explorer.arc.io' as const

/** Arc Testnet block explorer URL */
export const ARC_TESTNET_EXPLORER_URL = 'https://explorer.testnet.arc.io' as const

/**
 * USDC ERC-20 interface address on Arc.
 * This is the same address on both Mainnet and Testnet.
 *
 * Note: Arc USDC has two interfaces that share one underlying balance:
 *   - Native interface: 18 decimals (used for gas, msg.value, block.basefee)
 *   - ERC-20 interface: 6 decimals (used for transfer, balanceOf, display)
 *
 * The preflight probe uses the NATIVE interface (value: 1n) because
 * Arc's runtime-transfer-check fires on the native value path, not ERC-20.
 *
 * Source: https://docs.arc.network/arc/references/contract-addresses
 */
export const USDC_ADDRESS =
  '0x3600000000000000000000000000000000000000' as const

/**
 * Memo contract — attaches memo metadata to contract calls.
 * Same address on Mainnet and Testnet.
 * Source: https://docs.arc.network/arc/references/contract-addresses
 */
export const MEMO_ADDRESS =
  '0x5294E9927c3306DcBaDb03fe70b92e01cCede505' as const

/**
 * Multicall3From contract — batches calls while preserving msg.sender.
 * Same address on Mainnet and Testnet.
 *
 * IMPORTANT: If you maintain an offchain blocklist, include this address in
 * your monitoring. It preserves the original caller's address through Arc's
 * CallFrom precompile, meaning it can be used to route around naive checks.
 * Source: https://docs.arc.network/arc/references/contract-addresses
 */
export const MULTICALL3FROM_ADDRESS =
  '0x522fAf9A91c41c443c66765030741e4AaCe147D0' as const

/**
 * Known blocklisted test address on Arc Testnet.
 * Derived from mnemonic index 1:
 *   "test test test test test test test test test test test junk"
 *
 * A value transfer to or from this address reverts with runtime-transfer-check.
 * Use this address to test your preflight integration.
 *
 * Source: https://docs.arc.network/arc/references/contract-addresses
 */
export const TESTNET_BLOCKLISTED_ADDRESS =
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const

/**
 * Minimum base fee on Arc: 20 Gwei (in wei).
 * Transactions with maxFeePerGas lower than this value are silently dropped.
 * Source: https://docs.arc.network/arc/references/evm-differences
 */
export const MIN_BASE_FEE_WEI = 20n * 10n ** 9n

/**
 * Approximate gas units for a standard USDC ERC-20 transfer on Arc.
 * Used as a documented fallback when live gas estimation is unavailable.
 * Actual gas varies by contract complexity and state.
 */
export const USDC_TRANSFER_GAS_ESTIMATE = 34_000n

/**
 * A known OFAC-sanctioned Ethereum address that is blocklisted on Arc Mainnet.
 *
 * This is a Lazarus Group mixer address confirmed on the OFAC SDN list.
 * Use it for mainnet demos and testing — transfer simulations to this address
 * will return `safe: false` with `revertReason: "Blocked address"` on mainnet.
 *
 * ⚠️  Do NOT send real funds to this address.
 *
 * Source: OFAC SDN list; confirmed via eth_call on rpc.mainnet.arc.io
 */
export const MAINNET_DEMO_BLOCKED_ADDRESS =
  '0xd882cFc20F52f2599D84b8e8D58C7FB62cfE344b' as const
