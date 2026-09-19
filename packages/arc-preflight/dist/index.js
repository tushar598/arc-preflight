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
var MAINNET_DEMO_BLOCKED_ADDRESS = "0xd882cFc20F52f2599D84b8e8D58C7FB62cfE344b";
var USDC_EVENTS_ABI = [
  {
    type: "event",
    name: "Blacklisted",
    inputs: [{ name: "_account", type: "address", indexed: true }]
  },
  {
    type: "event",
    name: "UnBlacklisted",
    inputs: [{ name: "_account", type: "address", indexed: true }]
  }
];

// src/probe.ts
function extractRevertReason(err) {
  if (err == null) return "unknown error";
  const causeData = err?.cause?.data ?? err?.data;
  if (causeData?.startsWith("0x08c379a0")) {
    try {
      const hex = causeData.slice(10);
      const offsetHex = hex.slice(0, 64);
      const offset = parseInt(offsetHex, 16) * 2;
      const lengthHex = hex.slice(offset, offset + 64);
      const length = parseInt(lengthHex, 16);
      const strHex = hex.slice(offset + 64, offset + 64 + length * 2);
      const decoded = new TextDecoder().decode(
        new Uint8Array(strHex.match(/.{2}/g).map((b) => parseInt(b, 16)))
      );
      if (decoded) return decoded;
    } catch {
    }
  }
  const details = err?.details ?? err?.cause?.details;
  if (details && typeof details === "string") {
    const cleaned = details.replace(/^revert:\s*/i, "").trim();
    if (cleaned && !cleaned.toLowerCase().includes("transaction creation failed") && !cleaned.toLowerCase().includes("an internal error was received")) {
      return cleaned;
    }
  }
  const errStr = String(err?.message || err);
  const patterns = [
    /Blocked address/i,
    /runtime-transfer-check/i,
    /reverted(?:\s+with\s+reason)?:\s*(.+?)(?:\.|$)/i,
    /Revert:\s*(.+?)(?:\.|$)/i,
    /reason:\s*(.+?)(?:\.|$)/i
  ];
  for (const pattern of patterns) {
    const match = errStr.match(pattern);
    if (match?.[1]) return match[1].trim();
    if (match?.[0]) return match[0];
  }
  const shortMessage = err.shortMessage;
  if (shortMessage && !shortMessage.toLowerCase().includes("transaction creation failed") && !shortMessage.toLowerCase().includes("an internal error was received")) {
    return shortMessage;
  }
  return shortMessage || "execution reverted";
}
async function probe(sender, recipient, client, options = {}) {
  const simulatedValue = options.simulatedValue ?? 1n;
  if (simulatedValue <= 0n) {
    throw new RangeError(
      "arc-preflight: simulatedValue must be > 0. A zero-value send does not trigger Arc's blocklist check."
    );
  }
  if (options.cache?.has(sender) || options.cache?.has(recipient)) {
    return {
      safe: false,
      revertReason: "Blocked address (cached)",
      gasEstimate: USDC_TRANSFER_GAS_ESTIMATE
    };
  }
  try {
    await client.call({
      account: sender,
      to: recipient,
      value: simulatedValue,
      stateOverride: [
        {
          address: sender,
          balance: 10n ** 24n
          // 1,000,000 native USDC (18 decimals)
        }
      ]
    });
  } catch (err) {
    const errStr = String(err).toLowerCase();
    if (errStr.includes("stateoverride") || errStr.includes("state override") || errStr.includes("method not found")) {
      try {
        await client.call({
          account: sender,
          to: recipient,
          value: simulatedValue
        });
      } catch (retryErr) {
        return {
          safe: false,
          revertReason: extractRevertReason(retryErr),
          gasEstimate: USDC_TRANSFER_GAS_ESTIMATE
        };
      }
    } else {
      return {
        safe: false,
        revertReason: extractRevertReason(err),
        gasEstimate: USDC_TRANSFER_GAS_ESTIMATE
      };
    }
  }
  return {
    safe: true,
    revertReason: null,
    gasEstimate: USDC_TRANSFER_GAS_ESTIMATE
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

// src/adapters/ethers.ts
function extractRevertReason2(err) {
  if (err == null) return "unknown error";
  const e = err;
  const causeData = e.data ?? e.info?.error?.data;
  if (causeData?.startsWith("0x08c379a0")) {
    try {
      const hex = causeData.slice(10);
      const offsetHex = hex.slice(0, 64);
      const offset = parseInt(offsetHex, 16) * 2;
      const lengthHex = hex.slice(offset, offset + 64);
      const length = parseInt(lengthHex, 16);
      const strHex = hex.slice(offset + 64, offset + 64 + length * 2);
      const decoded = new TextDecoder().decode(
        new Uint8Array(strHex.match(/.{2}/g).map((b) => parseInt(b, 16)))
      );
      if (decoded) return decoded;
    } catch {
    }
  }
  const infoMsg = e.info?.error?.message;
  if (infoMsg && typeof infoMsg === "string" && !infoMsg.toLowerCase().includes("internal error") && !infoMsg.toLowerCase().includes("transaction failed")) {
    return infoMsg.replace(/^revert:\s*/i, "").trim();
  }
  const shortMessage = e.shortMessage;
  if (shortMessage && !shortMessage.toLowerCase().includes("transaction failed") && !shortMessage.toLowerCase().includes("an internal error")) {
    return shortMessage;
  }
  const errStr = String(e.message || err);
  const patterns = [
    /Blocked address/i,
    /runtime-transfer-check/i,
    /reverted(?:\s+with\s+reason)?:\s*(.+?)(?:\.|$)/i,
    /reason:\s*(.+?)(?:\.|$)/i
  ];
  for (const pattern of patterns) {
    const match = errStr.match(pattern);
    if (match?.[1]) return match[1].trim();
    if (match?.[0]) return match[0];
  }
  return shortMessage || "execution reverted";
}
async function probeEthers(sender, recipient, provider, options = {}) {
  const simulatedValue = options.simulatedValue ?? 1n;
  if (simulatedValue <= 0n) {
    throw new RangeError(
      "arc-preflight: simulatedValue must be > 0. A zero-value send does not trigger Arc's blocklist check."
    );
  }
  if (options.cache?.has(sender) || options.cache?.has(recipient)) {
    return {
      safe: false,
      revertReason: "Blocked address (cached)",
      gasEstimate: USDC_TRANSFER_GAS_ESTIMATE
    };
  }
  const stateOverride = {
    [sender]: {
      balance: "0x" + (10n ** 24n).toString(16)
      // 1,000,000 native USDC
    }
  };
  try {
    await provider.send("eth_call", [
      {
        from: sender,
        to: recipient,
        value: "0x" + simulatedValue.toString(16)
      },
      "latest",
      stateOverride
    ]);
  } catch (err) {
    const errStr = String(err).toLowerCase();
    if (errStr.includes("stateoverride") || errStr.includes("state override") || errStr.includes("unsupported") || errStr.includes("invalid argument") || errStr.includes("method not found")) {
      try {
        await provider.send("eth_call", [
          {
            from: sender,
            to: recipient,
            value: "0x" + simulatedValue.toString(16)
          },
          "latest"
        ]);
      } catch (retryErr) {
        return {
          safe: false,
          revertReason: extractRevertReason2(retryErr),
          gasEstimate: USDC_TRANSFER_GAS_ESTIMATE
        };
      }
    } else {
      return {
        safe: false,
        revertReason: extractRevertReason2(err),
        gasEstimate: USDC_TRANSFER_GAS_ESTIMATE
      };
    }
  }
  return {
    safe: true,
    revertReason: null,
    gasEstimate: USDC_TRANSFER_GAS_ESTIMATE
  };
}
async function preflightEthers(sender, recipient, provider, options) {
  return probeEthers(sender, recipient, provider, options);
}
function withPreflightEthers(signer, provider, options) {
  const guardedSigner = new Proxy(signer, {
    get(target, prop, receiver) {
      if (prop !== "sendTransaction") {
        return Reflect.get(target, prop, receiver);
      }
      return async (tx) => {
        const sender = await target.getAddress();
        const recipient = tx.to;
        const value = tx.value != null ? BigInt(tx.value.toString()) : 0n;
        if (sender && recipient && value > 0n) {
          const result = await probeEthers(sender, recipient, provider, {
            simulatedValue: value,
            ...options
          });
          if (!result.safe) {
            throw new PreflightError(result.revertReason ?? "execution reverted");
          }
        }
        return target.sendTransaction(tx);
      };
    }
  });
  return Object.assign(guardedSigner, { __preflight: true });
}

// data/sanctions.json
var sanctions_default = {
  version: "2026-09-18",
  source: "OFAC SDN (Specially Designated Nationals List)",
  description: "Ethereum wallet addresses from the US OFAC SDN list. Generated automatically. Do not edit manually.",
  count: 120,
  addresses: [
    "0x0330070fd38ec3bb94f58fa55d40368271e9e54a",
    "0x038989cbb1710c72b9920dc4fa529158f463e72c",
    "0x04dba1194ee10112fe6c3207c0687def0e78bacf",
    "0x08723392ed15743cc38513c4925f5e6be5c17243",
    "0x08b2efdcdb8822efe5ad0eae55517cf5dc544251",
    "0x0931ca4d13bb4ba75d9b7132ab690265d749a5e7",
    "0x098b716b8aaf21512996dc57eb0615e2383e2f96",
    "0x0ee5067b06776a89ccc7dc8ee369984ad7db5e06",
    "0x12de548f79a50d2bd05481c8515c1ef5183666a9",
    "0x14779cec0b117d5194c750c55ea1f42086631964",
    "0x1967d8af5bd86a497fb3dd7899a020e47560daaf",
    "0x1999ef52700c34de7ec2b68a28aafb37db0c5ade",
    "0x19aa5fe80d33a56d56c78e82ea5e50e5d80b4dff",
    "0x19f8f2b0915daa12a3f5c9cf01df9e24d53794f7",
    "0x1b8579cf6ab12ea6b74ac5fa41f3829a3cb61e6e",
    "0x1cab8177ace78b1b6b1c393371f4f2dcae40cbeb",
    "0x1d19b52b54e7ef5ea1a4b40b616165e798eac9f8",
    "0x1da5821544e25c636c1417ba96ade4cf6d2f9b5a",
    "0x21b8d56bda776bbe68655a16895afd96f5534fed",
    "0x252a8bd2319d8a555b872990601221b3a2053bce",
    "0x2711d73d559f62f4f855ee21f38378f528e07985",
    "0x2c7dcd774b33e10367f7d6385479e04f97d179dc",
    "0x2f389ce8bd8ff92de3402ffce4691d17fc4f6535",
    "0x308ed4b7b49797e1a98d3818bff6fe5385410370",
    "0x32da24ca413f3e7b53145d4737e172c3bdf81e3e",
    "0x35fb6f6db4fb05e6a4ce86f2c93691425626d4b1",
    "0x39d908dac893cbcb53cc86e0ecc369aa4def1a29",
    "0x3ad9db589d201a710ed237c829c7860ba86510fc",
    "0x3cbded43efdaf0fc77b9c55f6fc9988fcc9b757d",
    "0x3cffd56b47b7b41c56258d9c7731abadc360e073",
    "0x3e37627deaa754090fbfbb8bd226c1ce66d255e9",
    "0x4060cbf80734193f521a3cc6fd4e985df2825279",
    "0x43fa21d92141ba9db43052492e0deee5aa5f0a93",
    "0x48549a34ae37b12f6a30566245176994e17c6b4a",
    "0x4f428c11dc82388fa5136d636e613ad923eb700b",
    "0x4f47bc496083c727c5fbe3ce9cdf2b0f6496270c",
    "0x502371699497d08d5339c870851898d6d72521dd",
    "0x530a64c0ce595026a4a556b703644228179e2d57",
    "0x532b77b33a040587e9fd1800088225f99b8b0e8a",
    "0x53b6936513e738f44fb50d2b9476730c0ab3bfc1",
    "0x5512d943ed1f7c8a43f3435c85f7ab68b30121b0",
    "0x56de1527136f76a809e5b14ded6103eecd072ba7",
    "0x57ec89a0c056163a0314e413320f9b3abe761259",
    "0x5a14e72060c11313e38738009254a90968f58f51",
    "0x5a7a51bfb49f190e5a6060a5bc6052ac14a3b59f",
    "0x5d5b5dafecbf31bdb08bfd3edad4f2694372d0ef",
    "0x5f48c2a71b2cc96e3f0ccae4e39318ff0dc375b2",
    "0x67d40ee1a85bf4a4bb7ffae16de985e8427b6b45",
    "0x6b0736fed0634e15e19cc57fba19cd179c13abca",
    "0x6b69e2a7545c166417a80c61a77562052bffa9c5",
    "0x6be0ae71e6c41f2f9d0d1a3b8d0f75e6f6a0b46e",
    "0x6f1ca141a28907f78ebaa64fb83a9088b02a8352",
    "0x6fac4d18c912343bf86fa7049364dd4e424ab9c0",
    "0x72a5843cc08275c8171e582972aa4fda8c397b2a",
    "0x747afb5c7a7fc34b547cd0fdebf9b91759c5a52b",
    "0x76ea76ca4eb727f18956ab93445a94c5280412b9",
    "0x797d7ae72ebddcdea2a346c1834e04d1f8df102b",
    "0x7ced75026204ac29c34bea98905d4c949f27361e",
    "0x7db418b5d567a4e0e8c59ad71be1fce48f3e6107",
    "0x7f03679b56d8772530efa516b58bb83d4829e881",
    "0x7f19720a857f834887fc9a7bc0a0fbe7fc7f8102",
    "0x7f367cc41522ce07553e823bf3be79a889debe1b",
    "0x7ff9cfad3877f21d41da833e2f775db0569ee3d9",
    "0x83e5bc4ffa856bb84bb88581f5dd62a433a25e0d",
    "0x8576acc5c05d6ce88f4e49bf65bdf0c62f91353c",
    "0x8694ed130432be2cd3efff2e4d9dc52351dc7423",
    "0x8ac5381fcd9e7395d14e02986c344aada84b4bc6",
    "0x8d79c73daae8630c88de372ba8f57592fa987607",
    "0x8dce2aac0de82bdcaf6b4373b79f94331b8e4995",
    "0x901bb9583b24d97e995513c6778dc6888ab6870e",
    "0x931546d9e66836abf687d2bc64b30407bac8c568",
    "0x95584c303fcd48af5c6b9873015f2ad0ca84eae3",
    "0x961c5be54a2ffc17cf4cb021d863c42dacd47fc1",
    "0x9697749a9e8d6c119d8eeb0d6268a1b99c40684c",
    "0x97b1043abd9e6fc31681635166d430a458d14f9c",
    "0x983a81ca6fb1e441266d2fbcb7d8e530ac2e05a2",
    "0x9be599d7867f5e1a2d7ec6db9710df2b98a15573",
    "0x9c2bc757b66f24d60f016b6237f8cdd414a879fa",
    "0x9dd7fa4b4950154f7e75bdd8a77266b99b94ec08",
    "0x9f4cda013e354b8fc285bf4b9a60460cee7f7ea9",
    "0xa0e1c89ef1a489c9c7de96311ed5ce5d32c20e4b",
    "0xa40cfbfc8534ffc84e20a7d8bbc3729b26a35f6f",
    "0xa7e5d5a720f06526557c513402f2e6b5fa20b008",
    "0xac4cc4b68ea24bbfaac8fd127b67ed445accce22",
    "0xb338962b92cd818d6aef0a32a9ecd01212a71f33",
    "0xb5a69da691670f62510793f79a9b36c7db1a7b7c",
    "0xb637f84b66876ebf609c2a4208905f9ddac9d075",
    "0xb6f5ec1a0a9cd1526536d3f0426c429529471f40",
    "0xbb69e01921b17cd22080968bcc96ba6115da6062",
    "0xbd3276f265b83b5e828c05f46cde9d10a1521a24",
    "0xc103b7dc095c904b92081eef0c1640081ec01c10",
    "0xc2a3829f459b3edd87791c74cd45402ba0a20be3",
    "0xc455f7fd3e0e12afd51fba5c106909934d8a0e4a",
    "0xcb74874f1e06fcf80a306e06e5379a44b488ba2d",
    "0xd04e33461fea8302c5e1e13895b60cee8aefda7f",
    "0xd0975b32cea532eadddfc9c60481976e39db3472",
    "0xd5ed34b52ac4ab84d8fa8a231a3218bbf01ed510",
    "0xd81414abc631c6cadae1c6198b0c2b15a9b4fde5",
    "0xd8500c631dc32fa18645b7436344a99e4825e10e",
    "0xd882cfc20f52f2599d84b8e8d58c7fb62cfe344b",
    "0xdb2720ebad55399117ddb4c4a4afd9a4ccada8fe",
    "0xdcbeffbecce100cce9e4b153c4e15cb885643193",
    "0xe05f529f5284d75624eba386cb716928c3b54a2a",
    "0xe1d865c3d669dcc8c57c8d023140cb204e672ee4",
    "0xe1e4c5e5ed8f03ae61b581e2def126025f2b9401",
    "0xe3d35f68383732649669aa990832e017340dbca5",
    "0xe7aa314c77f4233c18c6cc84384a9247c0cf367b",
    "0xe950dc316b836e4eefb8308bf32bf7c72a1358ff",
    "0xeb507efa9ee692a4c774ad1de9f3cb26fc459da3",
    "0xed6e0a7e4ac94d976eebfb82ccf777a3c6bad921",
    "0xef85a6fafa5942a964dc618e94e230881d29ce2a",
    "0xefe301d259f525ca1ba74a7977b80d5b060b3cca",
    "0xf1c4c44d2dcbcfa704349e3b57628dbd8404e597",
    "0xf2235d55b2950a0b1317469d72d07ae65b2e27cb",
    "0xf3701f445b6bdafedbca97d1e477357839e4120d",
    "0xf4377eda661e04b6dda78969796ed31658d602d4",
    "0xf45ecc3a59c7911181c659ce9115854c6175be91",
    "0xf7b31119c2682c88d88d455dbb9d5932c65cf1be",
    "0xfb3eff152ea55d1bfa04dbdd509a80fd7b72cdeb",
    "0xfda1ec4a6178d4916b001a065422d31ebe5f62ff"
  ]
};

// src/sanctions.ts
var data = sanctions_default;
var SANCTIONS_SET = new Set(
  data.addresses.map((a) => a.toLowerCase())
);
function checkSanctions(address) {
  if (!address || typeof address !== "string") return false;
  return SANCTIONS_SET.has(address.toLowerCase());
}
var sanctionsVersion = data.version;
var sanctionsCount = data.count;

// src/cache.ts
import "viem";
function createBlocklistCache(client) {
  const blocklist = /* @__PURE__ */ new Set();
  let unwatch = null;
  return {
    get isRunning() {
      return unwatch !== null;
    },
    has(address) {
      return blocklist.has(address.toLowerCase());
    },
    start() {
      if (unwatch) return;
      unwatch = client.watchContractEvent({
        address: USDC_ADDRESS,
        abi: USDC_EVENTS_ABI,
        onLogs: (logs) => {
          for (const log of logs) {
            const eventName = log.eventName;
            const account = log.args?._account?.toLowerCase();
            if (!account) continue;
            if (eventName === "Blacklisted") {
              blocklist.add(account);
            } else if (eventName === "UnBlacklisted") {
              blocklist.delete(account);
            }
          }
        }
      });
    },
    stop() {
      if (unwatch) {
        unwatch();
        unwatch = null;
      }
    }
  };
}
export {
  ARC_MAINNET_CHAIN_ID,
  ARC_MAINNET_EXPLORER_URL,
  ARC_MAINNET_RPC_URL,
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_EXPLORER_URL,
  ARC_TESTNET_RPC_URL,
  MAINNET_DEMO_BLOCKED_ADDRESS,
  MEMO_ADDRESS,
  MIN_BASE_FEE_WEI,
  MULTICALL3FROM_ADDRESS,
  PreflightError,
  TESTNET_BLOCKLISTED_ADDRESS,
  USDC_ADDRESS,
  USDC_EVENTS_ABI,
  USDC_TRANSFER_GAS_ESTIMATE,
  checkSanctions,
  createBlocklistCache,
  preflight,
  preflightEthers,
  sanctionsCount,
  sanctionsVersion,
  withPreflight,
  withPreflightEthers
};
