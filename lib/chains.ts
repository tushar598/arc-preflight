import { defineChain } from 'viem'
import {
  ARC_MAINNET_CHAIN_ID,
  ARC_MAINNET_RPC_URL,
  ARC_MAINNET_EXPLORER_URL,
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_RPC_URL,
  ARC_TESTNET_EXPLORER_URL,
} from 'arc-preflight'

export const arcMainnet = defineChain({
  id: ARC_MAINNET_CHAIN_ID,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [ARC_MAINNET_RPC_URL] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: ARC_MAINNET_EXPLORER_URL } },
})

export const arcTestnet = defineChain({
  id: ARC_TESTNET_CHAIN_ID,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [ARC_TESTNET_RPC_URL] } },
  blockExplorers: { default: { name: 'Arc Testnet Explorer', url: ARC_TESTNET_EXPLORER_URL } },
  testnet: true,
})

export type ChainKey = 'mainnet' | 'testnet'
export const CHAINS = { mainnet: arcMainnet, testnet: arcTestnet } as const
