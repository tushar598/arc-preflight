# Phase 1 Research: Arc Environment Reconfirmation

**Source:** https://docs.arc.network (official Arc documentation, fetched 2026-09-19)

## Network Configuration

| Field | Mainnet | Testnet |
|---|---|---|
| Chain ID | `5042` | `5042002` |
| RPC URL | `https://rpc.mainnet.arc.io` | `https://rpc.testnet.arc.network` |
| Block Explorer | `https://explorer.arc.io` | `https://explorer.testnet.arc.io` |
| Native Token | USDC | USDC |
| Faucet | n/a | `https://faucet.circle.com` |

## Contract Addresses

All addresses are identical on Mainnet and Testnet unless noted.

| Contract | Address | Notes |
|---|---|---|
| **USDC (ERC-20 interface)** | `0x3600000000000000000000000000000000000000` | 6 decimals. Native interface has 18 decimals. Same address on both. |
| **EURC** | `0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1` (mainnet) / `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` (testnet) | 6 decimals |
| **Memo** | `0x5294E9927c3306DcBaDb03fe70b92e01cCede505` | Attaches memo metadata. Same address on both. |
| **Multicall3From** | `0x522fAf9A91c41c443c66765030741e4AaCe147D0` | Batches calls with preserved `msg.sender`. Same address on both. |
| **Multicall3** | `0xcA11bde05977b3631167028862bE2a173976CA11` | Standard Multicall3. Same address on both. |
| **Permit2** | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | Required for StableFX. Same address on both. |

## Known Blocklisted Test Address (Testnet Only)

| Field | Value |
|---|---|
| Address | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |
| Mnemonic | `test test test test test test test test test test test junk` (index 1) |
| Behavior | A value transfer to or from this address reverts at runtime, including when the address is the beneficiary of a `SELFDESTRUCT`. |

**To get private key:**
```bash
cast wallet private-key --mnemonic "test test test test test test test test test test test junk" --mnemonic-index 1
```

## Key EVM Differences (Arc vs. Ethereum)

1. **USDC is the native gas token.** No ETH. Minimum base fee is **20 Gwei**.
2. **Blocklist enforced at runtime.** A value transfer to or from a blocklisted address reverts even if sender has sufficient balance. Gas is still consumed.
3. **Burning is forbidden.** Transfers to the zero address (when non-zero value) revert with `"Zero address not allowed"`.
4. **No blob transactions (EIP-4844).** The mempool rejects type-3 transactions.
5. **USDC decimals:** Native interface = 18 decimals; ERC-20 interface = 6 decimals. Do NOT mix.
6. **arc-anvil:** Use `arc-anvil --network arc` (from `arc-foundry`) to simulate Arc's runtime behavior locally. Standard `anvil` cannot reproduce Arc-specific reverts.

## Preflight Probe Strategy

The `eth_call` probe should simulate a USDC native transfer to the recipient address. Arc's runtime will enforce the blocklist check synchronously within the `eth_call`, making it revert without submitting a transaction. This gives us:
- **Exact revert reason:** `"runtime-transfer-check"` (from blocklist enforcement)
- **Gas estimate:** The `eth_estimateGas` response when not reverted tells us actual cost saved

## Local Test Environment

```bash
# Install Arc Foundry
cargo install --git https://github.com/circlefin/arc-foundry arc-anvil

# Fork Arc testnet locally
arc-anvil --network arc --fork-url https://rpc.testnet.arc.network
```
