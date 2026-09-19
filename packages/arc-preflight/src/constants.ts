/**
 * constants.ts
 *
 * Arc chain and contract constants.
 * All values sourced from https://docs.arc.io (official Arc documentation)
 * and verified against the public mainnet / testnet RPCs.
 *
 * These are the canonical addresses used throughout the arc-preflight SDK.
 * They are exported so callers can reference them without hardcoding strings.
 */

import type { Address } from 'viem'

// ---------------------------------------------------------------------------
// Chains
// ---------------------------------------------------------------------------

/** Arc Mainnet chain ID */
export const ARC_MAINNET_CHAIN_ID = 5042 as const

/** Arc Testnet chain ID */
export const ARC_TESTNET_CHAIN_ID = 5042002 as const

/** Arc Mainnet public RPC URL (no API key) */
export const ARC_MAINNET_RPC_URL = 'https://rpc.mainnet.arc.io' as const

/** Arc Testnet public RPC URL (no API key) */
export const ARC_TESTNET_RPC_URL = 'https://rpc.testnet.arc.network' as const

/** Arc Mainnet block explorer URL */
export const ARC_MAINNET_EXPLORER_URL = 'https://explorer.arc.io' as const

/** Arc Testnet block explorer URL */
export const ARC_TESTNET_EXPLORER_URL = 'https://explorer.testnet.arc.io' as const

// ---------------------------------------------------------------------------
// Predeploys
// ---------------------------------------------------------------------------

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
 * Source: https://docs.arc.io/arc/references/contract-addresses
 */
export const USDC_ADDRESS =
  '0x3600000000000000000000000000000000000000' as const

/**
 * Memo contract — wraps a call (typically a USDC `transfer`) and emits a
 * `Memo` event, routing the inner call through the CallFrom precompile so
 * the target still sees the ORIGINAL sender as `msg.sender`.
 * Same address on Mainnet and Testnet.
 * Source: https://docs.arc.io/arc/references/contract-addresses
 */
export const MEMO_ADDRESS =
  '0x5294E9927c3306DcBaDb03fe70b92e01cCede505' as const

/**
 * Multicall3From contract — batches calls like Multicall3 but preserves the
 * original `msg.sender` in each subcall via the CallFrom precompile.
 * Same address on Mainnet and Testnet.
 *
 * IMPORTANT: If you maintain an offchain blocklist, include this address in
 * your monitoring. Because it preserves the original caller, it can be used
 * to route a blocked transfer around a naive "check `tx.to` only" guard.
 * arc-preflight decodes its calldata and checks every inner recipient.
 * Source: https://docs.arc.io/arc/references/contract-addresses
 */
export const MULTICALL3FROM_ADDRESS =
  '0x522fAf9A91c41c443c66765030741e4AaCe147D0' as const

/**
 * System emitter for native USDC `Transfer` logs (EIP-7708).
 * A plain native send emits a `Transfer` log from THIS address, not from the
 * ERC-20 USDC address. Index on it to see native value movement.
 * Source: https://docs.arc.io/arc/references/usdc-system-events
 */
export const SYSTEM_EMITTER_ADDRESS =
  '0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE' as const

/**
 * Arc native-coin precompiles. Sending native value to a precompile reverts.
 * Source: https://docs.arc.io/arc/references/evm-differences
 */
export const NATIVE_COIN_AUTHORITY_PRECOMPILE_ADDRESS =
  '0x1800000000000000000000000000000000000000' as const
export const NATIVE_COIN_CONTROL_PRECOMPILE_ADDRESS =
  '0x1800000000000000000000000000000000000001' as const
export const CALLFROM_PRECOMPILE_ADDRESS =
  '0x1800000000000000000000000000000000000003' as const

/**
 * All Arc-specific precompile addresses (0x1800…0000 – 0x1800…0004).
 * Used to classify a revert as `PRECOMPILE` when the destination is one of these.
 */
export const ARC_PRECOMPILE_ADDRESSES: readonly Address[] = [
  '0x1800000000000000000000000000000000000000',
  '0x1800000000000000000000000000000000000001',
  '0x1800000000000000000000000000000000000002',
  '0x1800000000000000000000000000000000000003',
  '0x1800000000000000000000000000000000000004',
] as const

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/**
 * Known blocklisted test address on Arc Testnet.
 * Derived from mnemonic index 1:
 *   "test test test test test test test test test test test junk"
 *
 * A value transfer to or from this address reverts with "Blocked address".
 * Use this address to test your preflight integration on TESTNET.
 *
 * Source: https://docs.arc.io/arc/references/contract-addresses
 */
export const TESTNET_BLOCKLISTED_ADDRESS =
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const

/**
 * A known OFAC-sanctioned Ethereum address that is blocklisted on Arc Mainnet.
 *
 * This is a Lazarus Group mixer address confirmed on the OFAC SDN list.
 * Use it for mainnet demos and testing — transfer simulations to this address
 * return `safe: false` with `revertReason: "Blocked address"` on mainnet.
 *
 * ⚠️  Do NOT send real funds to this address.
 *
 * Source: OFAC SDN list; confirmed via eth_call on rpc.mainnet.arc.io
 */
export const MAINNET_DEMO_BLOCKED_ADDRESS =
  '0xd882cFc20F52f2599D84b8e8D58C7FB62cfE344b' as const

/** The zero address. A value-bearing send to it reverts on Arc. */
export const ZERO_ADDRESS =
  '0x0000000000000000000000000000000000000000' as const

// ---------------------------------------------------------------------------
// Fees & gas
// ---------------------------------------------------------------------------

/**
 * Minimum base fee on Arc: 20 Gwei (in wei).
 * Transactions with maxFeePerGas lower than this value are silently dropped.
 * Source: https://docs.arc.io/arc/references/evm-differences
 */
export const MIN_BASE_FEE_WEI = 20n * 10n ** 9n

/**
 * FALLBACK gas estimate for a USDC transfer on Arc, used when a live
 * `eth_estimateGas` is not possible — which is exactly the case for a transfer
 * that would revert (you cannot estimate gas for a reverting call).
 *
 * ~34,000 gas ≈ an ERC-20 USDC `transfer()`. A plain native send is 21,000.
 * When the transfer is safe, `preflight()` returns the live estimate instead.
 */
export const USDC_TRANSFER_GAS_ESTIMATE = 34_000n

// ---------------------------------------------------------------------------
// ABIs
// ---------------------------------------------------------------------------

/**
 * Minimal ABI for USDC FiatTokenV2 blocklist events.
 * Used by the optional local BlocklistCache.
 */
export const USDC_EVENTS_ABI = [
  {
    type: 'event',
    name: 'Blacklisted',
    inputs: [{ name: '_account', type: 'address', indexed: true }],
  },
  {
    type: 'event',
    name: 'UnBlacklisted',
    inputs: [{ name: '_account', type: 'address', indexed: true }],
  },
] as const

/**
 * `USDC.isBlacklisted(address)` — FiatTokenV2 view.
 * Verified present on both Arc mainnet and testnet (selector 0xfe575a87).
 */
export const USDC_BLACKLIST_ABI = [
  {
    type: 'function',
    name: 'isBlacklisted',
    stateMutability: 'view',
    inputs: [{ name: '_account', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

/**
 * ERC-20 transfer functions plus EIP-3009 authorization transfers, as
 * implemented by USDC. Used by the calldata decoder to find inner recipients.
 */
export const ERC20_TRANSFER_ABI = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'transferFrom',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  // EIP-3009 (v, r, s variant)
  {
    type: 'function',
    name: 'transferWithAuthorization',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [],
  },
  // EIP-3009 (packed signature variant, FiatTokenV2_2)
  {
    type: 'function',
    name: 'transferWithAuthorization',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'receiveWithAuthorization',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'receiveWithAuthorization',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
] as const

/**
 * Arc Memo contract ABI.
 * `memo(target, data, memoId, memoData)` forwards `data` to `target` via
 * CallFrom, preserving the original `msg.sender`.
 * Source: https://docs.arc.io/arc/tutorials/send-usdc-with-transaction-memo
 */
export const MEMO_ABI = [
  {
    type: 'function',
    name: 'memo',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'target', type: 'address' },
      { name: 'data', type: 'bytes' },
      { name: 'memoId', type: 'bytes32' },
      { name: 'memoData', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'event',
    name: 'Memo',
    anonymous: false,
    inputs: [
      { name: 'sender', type: 'address', indexed: true },
      { name: 'target', type: 'address', indexed: true },
      { name: 'callDataHash', type: 'bytes32', indexed: false },
      { name: 'memoId', type: 'bytes32', indexed: true },
      { name: 'memo', type: 'bytes', indexed: false },
      { name: 'memoIndex', type: 'uint256', indexed: false },
    ],
  },
] as const

/**
 * Multicall3From ABI (the Multicall3 surface that is present in the deployed
 * bytecode — verified selectors: aggregate, aggregate3, tryAggregate,
 * blockAndAggregate, tryBlockAndAggregate).
 */
export const MULTICALL3FROM_ABI = [
  {
    type: 'function',
    name: 'aggregate',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'calls',
        type: 'tuple[]',
        components: [
          { name: 'target', type: 'address' },
          { name: 'callData', type: 'bytes' },
        ],
      },
    ],
    outputs: [
      { name: 'blockNumber', type: 'uint256' },
      { name: 'returnData', type: 'bytes[]' },
    ],
  },
  {
    type: 'function',
    name: 'aggregate3',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'calls',
        type: 'tuple[]',
        components: [
          { name: 'target', type: 'address' },
          { name: 'allowFailure', type: 'bool' },
          { name: 'callData', type: 'bytes' },
        ],
      },
    ],
    outputs: [
      {
        name: 'returnData',
        type: 'tuple[]',
        components: [
          { name: 'success', type: 'bool' },
          { name: 'returnData', type: 'bytes' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'tryAggregate',
    stateMutability: 'payable',
    inputs: [
      { name: 'requireSuccess', type: 'bool' },
      {
        name: 'calls',
        type: 'tuple[]',
        components: [
          { name: 'target', type: 'address' },
          { name: 'callData', type: 'bytes' },
        ],
      },
    ],
    outputs: [
      {
        name: 'returnData',
        type: 'tuple[]',
        components: [
          { name: 'success', type: 'bool' },
          { name: 'returnData', type: 'bytes' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'blockAndAggregate',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'calls',
        type: 'tuple[]',
        components: [
          { name: 'target', type: 'address' },
          { name: 'callData', type: 'bytes' },
        ],
      },
    ],
    outputs: [
      { name: 'blockNumber', type: 'uint256' },
      { name: 'blockHash', type: 'bytes32' },
      {
        name: 'returnData',
        type: 'tuple[]',
        components: [
          { name: 'success', type: 'bool' },
          { name: 'returnData', type: 'bytes' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'tryBlockAndAggregate',
    stateMutability: 'payable',
    inputs: [
      { name: 'requireSuccess', type: 'bool' },
      {
        name: 'calls',
        type: 'tuple[]',
        components: [
          { name: 'target', type: 'address' },
          { name: 'callData', type: 'bytes' },
        ],
      },
    ],
    outputs: [
      { name: 'blockNumber', type: 'uint256' },
      { name: 'blockHash', type: 'bytes32' },
      {
        name: 'returnData',
        type: 'tuple[]',
        components: [
          { name: 'success', type: 'bool' },
          { name: 'returnData', type: 'bytes' },
        ],
      },
    ],
  },
] as const
