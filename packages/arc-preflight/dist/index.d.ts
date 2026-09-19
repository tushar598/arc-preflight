import { Address, PublicClient, WalletClient } from 'viem';
export { Address } from 'viem';

/**
 * types.ts
 *
 * Shared TypeScript types for the arc-preflight SDK.
 */

/**
 * The result returned by `preflight()`.
 *
 * @example
 * ```ts
 * const result = await preflight(sender, recipient, client)
 * if (!result.safe) {
 *   console.error('Transfer would revert:', result.revertReason)
 *   return
 * }
 * // proceed with sendTransaction
 * ```
 */
type PreflightResult = {
    /**
     * `true` when the simulated transfer succeeded — the transfer is safe to submit.
     * `false` when the transfer would revert (e.g., blocklisted address).
     */
    safe: boolean;
    /**
     * The revert reason string when `safe` is `false`.
     * `null` when `safe` is `true`.
     *
     * Common values on Arc:
     * - `"runtime-transfer-check"` — sender or recipient is blocklisted
     * - `"Zero address not allowed"` — recipient is 0x0
     */
    revertReason: string | null;
    /**
     * Estimated gas units for this transfer type on Arc.
     * Useful for calculating the USDC cost saved by catching a revert early.
     *
     * Gas cost in USDC = `gasEstimate × baseFeePerGas / 1e18`
     * Minimum base fee on Arc is 20 Gwei (see constants.ts).
     */
    gasEstimate: bigint;
};
/**
 * Options accepted by `preflight()`.
 */
type PreflightOptions = {
    /**
     * Amount of native USDC (in wei, 18 decimals) to simulate sending.
     *
     * Defaults to `1n` — just enough to trigger Arc's runtime blocklist check.
     * A higher value produces a more accurate gas estimate but doesn't change
     * whether the blocklist check fires (any non-zero value is sufficient).
     *
     * Do NOT use 0 — a zero-value send does not trigger the blocklist check.
     */
    simulatedValue?: bigint;
};

/**
 * adapters/viem.ts
 *
 * Viem adapter for arc-preflight.
 *
 * Exports:
 *   - `preflight()` — one-shot preflight check for a single transfer
 *   - `withPreflight()` — wraps a WalletClient with automatic preflight guards
 */

/**
 * Checks whether a native USDC transfer from `sender` to `recipient` would
 * revert on Arc before submitting anything to the chain.
 *
 * Uses Arc's own runtime via `eth_call` — any address that is blocklisted
 * will cause the simulated call to revert, and you get the exact revert reason.
 *
 * @example
 * ```ts
 * import { createPublicClient, http } from 'viem'
 * import { preflight } from 'arc-preflight'
 *
 * const client = createPublicClient({ transport: http('https://rpc.testnet.arc.network') })
 *
 * const result = await preflight(
 *   '0xYourSender',
 *   '0xRecipient',
 *   client,
 * )
 *
 * if (!result.safe) {
 *   console.error('Transfer blocked:', result.revertReason)
 * }
 * ```
 *
 * @param sender    - The address initiating the transfer
 * @param recipient - The destination address
 * @param client    - A Viem PublicClient connected to an Arc node
 * @param options   - Optional configuration (simulatedValue, etc.)
 */
declare function preflight(sender: Address, recipient: Address, client: PublicClient, options?: PreflightOptions): Promise<PreflightResult>;
/**
 * Wraps a Viem WalletClient with an automatic preflight guard.
 *
 * Every call to `sendTransaction` on the returned client will first run a
 * preflight check. If the transfer would revert, a `PreflightError` is thrown
 * BEFORE any gas is spent.
 *
 * @example
 * ```ts
 * import { createWalletClient, createPublicClient, http } from 'viem'
 * import { withPreflight, PreflightError } from 'arc-preflight'
 *
 * const walletClient = createWalletClient({ ... })
 * const publicClient = createPublicClient({ ... })
 *
 * const guardedClient = withPreflight(walletClient, publicClient)
 *
 * try {
 *   const hash = await guardedClient.sendTransaction({ to: recipient, value: amount })
 * } catch (err) {
 *   if (err instanceof PreflightError) {
 *     console.log('Blocked before submission:', err.revertReason)
 *   }
 * }
 * ```
 *
 * @param walletClient - The Viem WalletClient to wrap
 * @param publicClient - A Viem PublicClient used for the eth_call simulation
 * @param options      - Optional preflight configuration
 * @returns A proxy object with the same interface as WalletClient, but with
 *          preflight guards on `sendTransaction`
 */
declare function withPreflight(walletClient: WalletClient, publicClient: PublicClient, options?: PreflightOptions): WalletClient & {
    __preflight: true;
};

/**
 * errors.ts
 *
 * Custom error classes for the arc-preflight SDK.
 */
/**
 * Thrown by `withPreflight()` when a transfer would revert on Arc.
 *
 * Callers can check `instanceof PreflightError` to distinguish this from
 * other errors (e.g., network errors, insufficient balance).
 *
 * @example
 * ```ts
 * try {
 *   await guardedClient.sendTransaction({ to, value })
 * } catch (err) {
 *   if (err instanceof PreflightError) {
 *     console.log('Blocked:', err.revertReason)
 *   }
 * }
 * ```
 */
declare class PreflightError extends Error {
    /** The raw revert reason string from Arc's runtime check. */
    readonly revertReason: string;
    constructor(revertReason: string);
}

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
declare const ARC_MAINNET_CHAIN_ID: 5042;
/** Arc Testnet chain ID */
declare const ARC_TESTNET_CHAIN_ID: 5042002;
/** Arc Mainnet RPC URL */
declare const ARC_MAINNET_RPC_URL: "https://rpc.mainnet.arc.io";
/** Arc Testnet RPC URL */
declare const ARC_TESTNET_RPC_URL: "https://rpc.testnet.arc.network";
/** Arc Mainnet block explorer URL */
declare const ARC_MAINNET_EXPLORER_URL: "https://explorer.arc.io";
/** Arc Testnet block explorer URL */
declare const ARC_TESTNET_EXPLORER_URL: "https://explorer.testnet.arc.io";
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
declare const USDC_ADDRESS: "0x3600000000000000000000000000000000000000";
/**
 * Memo contract — attaches memo metadata to contract calls.
 * Same address on Mainnet and Testnet.
 * Source: https://docs.arc.network/arc/references/contract-addresses
 */
declare const MEMO_ADDRESS: "0x5294E9927c3306DcBaDb03fe70b92e01cCede505";
/**
 * Multicall3From contract — batches calls while preserving msg.sender.
 * Same address on Mainnet and Testnet.
 *
 * IMPORTANT: If you maintain an offchain blocklist, include this address in
 * your monitoring. It preserves the original caller's address through Arc's
 * CallFrom precompile, meaning it can be used to route around naive checks.
 * Source: https://docs.arc.network/arc/references/contract-addresses
 */
declare const MULTICALL3FROM_ADDRESS: "0x522fAf9A91c41c443c66765030741e4AaCe147D0";
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
declare const TESTNET_BLOCKLISTED_ADDRESS: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
/**
 * Minimum base fee on Arc: 20 Gwei (in wei).
 * Transactions with maxFeePerGas lower than this value are silently dropped.
 * Source: https://docs.arc.network/arc/references/evm-differences
 */
declare const MIN_BASE_FEE_WEI: bigint;
/**
 * Approximate gas units for a standard USDC ERC-20 transfer on Arc.
 * Used as a documented fallback when live gas estimation is unavailable.
 * Actual gas varies by contract complexity and state.
 */
declare const USDC_TRANSFER_GAS_ESTIMATE = 34000n;

export { ARC_MAINNET_CHAIN_ID, ARC_MAINNET_EXPLORER_URL, ARC_MAINNET_RPC_URL, ARC_TESTNET_CHAIN_ID, ARC_TESTNET_EXPLORER_URL, ARC_TESTNET_RPC_URL, MEMO_ADDRESS, MIN_BASE_FEE_WEI, MULTICALL3FROM_ADDRESS, PreflightError, type PreflightOptions, type PreflightResult, TESTNET_BLOCKLISTED_ADDRESS, USDC_ADDRESS, USDC_TRANSFER_GAS_ESTIMATE, preflight, withPreflight };
