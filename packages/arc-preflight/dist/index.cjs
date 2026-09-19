"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  ARC_MAINNET_CHAIN_ID: () => ARC_MAINNET_CHAIN_ID,
  ARC_MAINNET_EXPLORER_URL: () => ARC_MAINNET_EXPLORER_URL,
  ARC_MAINNET_RPC_URL: () => ARC_MAINNET_RPC_URL,
  ARC_TESTNET_CHAIN_ID: () => ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_EXPLORER_URL: () => ARC_TESTNET_EXPLORER_URL,
  ARC_TESTNET_RPC_URL: () => ARC_TESTNET_RPC_URL,
  MEMO_ADDRESS: () => MEMO_ADDRESS,
  MIN_BASE_FEE_WEI: () => MIN_BASE_FEE_WEI,
  MULTICALL3FROM_ADDRESS: () => MULTICALL3FROM_ADDRESS,
  PreflightError: () => PreflightError,
  TESTNET_BLOCKLISTED_ADDRESS: () => TESTNET_BLOCKLISTED_ADDRESS,
  USDC_ADDRESS: () => USDC_ADDRESS,
  USDC_TRANSFER_GAS_ESTIMATE: () => USDC_TRANSFER_GAS_ESTIMATE,
  preflight: () => preflight,
  withPreflight: () => withPreflight
});
module.exports = __toCommonJS(index_exports);

// src/constants.ts
var ARC_MAINNET_CHAIN_ID = 5042;
var ARC_TESTNET_CHAIN_ID = 5042002;
var ARC_MAINNET_RPC_URL = "https://rpc.mainnet.arc.io";
var ARC_TESTNET_RPC_URL = "https://rpc.testnet.arc.network";
var ARC_MAINNET_EXPLORER_URL = "https://explorer.arc.io";
var ARC_TESTNET_EXPLORER_URL = "https://explorer.testnet.arc.io";
var USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
var MEMO_ADDRESS = "0x5294E9927c3306DcBaDb03fe70b92e01cCede505";
var MULTICALL3FROM_ADDRESS = "0x522fAf9A91c41c443c66765030741e4AaCe147D0";
var TESTNET_BLOCKLISTED_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
var MIN_BASE_FEE_WEI = 20n * 10n ** 9n;
var USDC_TRANSFER_GAS_ESTIMATE = 34000n;

// src/probe.ts
function extractRevertReason(err) {
  if (err == null) return "unknown error";
  const shortMessage = err.shortMessage;
  if (shortMessage) return shortMessage;
  const causeData = err?.cause?.data;
  if (causeData?.startsWith("0x08c379a0")) {
    try {
      const hex = causeData.slice(10);
      const offsetHex = hex.slice(0, 64);
      const offset = parseInt(offsetHex, 16) * 2;
      const lengthHex = hex.slice(offset, offset + 64);
      const length = parseInt(lengthHex, 16);
      const strHex = hex.slice(offset + 64, offset + 64 + length * 2);
      const decoded = Buffer.from(strHex, "hex").toString("utf8");
      if (decoded) return decoded;
    } catch {
    }
  }
  const errStr = String(err);
  const patterns = [
    // "reverted with reason: <reason>"
    /reverted(?:\s+with\s+reason)?:\s*(.+?)(?:\.|$)/i,
    // "Revert: <reason>"
    /Revert:\s*(.+?)(?:\.|$)/i,
    // "reason: <reason>"
    /reason:\s*(.+?)(?:\.|$)/i
  ];
  for (const pattern of patterns) {
    const match = errStr.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "execution reverted";
}
async function probe(sender, recipient, client, options = {}) {
  const simulatedValue = options.simulatedValue ?? 1n;
  if (simulatedValue <= 0n) {
    throw new RangeError(
      "arc-preflight: simulatedValue must be > 0. A zero-value send does not trigger Arc's blocklist check."
    );
  }
  try {
    await client.call({
      account: sender,
      to: recipient,
      value: simulatedValue
    });
  } catch (err) {
    const revertReason = extractRevertReason(err);
    return {
      safe: false,
      revertReason,
      // For an unsafe transfer, return the documented gas constant as an
      // estimate of what would have been wasted (gas is consumed even on revert)
      gasEstimate: USDC_TRANSFER_GAS_ESTIMATE
    };
  }
  let gasEstimate = USDC_TRANSFER_GAS_ESTIMATE;
  try {
    gasEstimate = await client.estimateGas({
      account: sender,
      to: recipient,
      value: simulatedValue
    });
  } catch {
    gasEstimate = USDC_TRANSFER_GAS_ESTIMATE;
  }
  return {
    safe: true,
    revertReason: null,
    gasEstimate
  };
}

// src/errors.ts
var PreflightError = class extends Error {
  constructor(revertReason) {
    super(`arc-preflight: transfer would revert \u2014 ${revertReason}`);
    this.name = "PreflightError";
    this.revertReason = revertReason;
    Object.setPrototypeOf(this, new.target.prototype);
  }
};

// src/adapters/viem.ts
async function preflight(sender, recipient, client, options) {
  return probe(sender, recipient, client, options);
}
function withPreflight(walletClient, publicClient, options) {
  const guardedClient = new Proxy(walletClient, {
    get(target, prop, receiver) {
      if (prop !== "sendTransaction") {
        return Reflect.get(target, prop, receiver);
      }
      return async (params) => {
        const account = params.account ?? walletClient.account;
        const sender = typeof account === "string" ? account : account?.address;
        const recipient = params.to;
        if (sender && recipient && (params.value ?? 0n) > 0n) {
          const result = await probe(
            sender,
            recipient,
            publicClient,
            {
              simulatedValue: params.value ?? 1n,
              ...options
            }
          );
          if (!result.safe) {
            throw new PreflightError(result.revertReason ?? "execution reverted");
          }
        }
        return target.sendTransaction(params);
      };
    }
  });
  return Object.assign(guardedClient, { __preflight: true });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ARC_MAINNET_CHAIN_ID,
  ARC_MAINNET_EXPLORER_URL,
  ARC_MAINNET_RPC_URL,
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_EXPLORER_URL,
  ARC_TESTNET_RPC_URL,
  MEMO_ADDRESS,
  MIN_BASE_FEE_WEI,
  MULTICALL3FROM_ADDRESS,
  PreflightError,
  TESTNET_BLOCKLISTED_ADDRESS,
  USDC_ADDRESS,
  USDC_TRANSFER_GAS_ESTIMATE,
  preflight,
  withPreflight
});
