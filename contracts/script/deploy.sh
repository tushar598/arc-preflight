#!/usr/bin/env bash
# Deploys PreflightPayout through the deterministic CREATE2 deployer
# (0x4e59b448…956C, present on Arc mainnet and testnet), so the contract lands at
# the same address on both networks and that address can ship in the SDK.
#
#   contracts/script/deploy.sh testnet            # uses $PRIVATE_KEY
#   contracts/script/deploy.sh mainnet --account arc-deployer   # any `cast send` wallet flags
#
# Idempotent: if the code is already there it says so and exits 0.
set -euo pipefail

NET="${1:-testnet}"
shift || true
case "$NET" in
  testnet) RPC="https://rpc.testnet.arc.network"; EXPLORER="https://explorer.testnet.arc.io" ;;
  mainnet) RPC="https://rpc.mainnet.arc.io"; EXPLORER="https://explorer.arc.io" ;;
  *) echo "usage: $0 testnet|mainnet [cast wallet flags]" >&2; exit 2 ;;
esac

WALLET=("$@")
if [ ${#WALLET[@]} -eq 0 ]; then
  : "${PRIVATE_KEY:?set PRIVATE_KEY or pass cast wallet flags, e.g. --account <name>}"
  WALLET=(--private-key "$PRIVATE_KEY")
fi

cd "$(dirname "$0")/.."
forge build --quiet

FACTORY=0x4e59b44847b379578588920cA78FbF26c0B4956C
SALT=$(cast keccak "arc-preflight.PreflightPayout.v1")
INIT=$(jq -r .bytecode.object out/PreflightPayout.sol/PreflightPayout.json)
ADDR=$(cast create2 --deployer "$FACTORY" --salt "$SALT" --init-code "$INIT" | grep -oE '\b0x[0-9a-fA-F]{40}\b' | head -1)

echo "network   $NET"
echo "address   $ADDR"

if [ "$(cast codesize "$ADDR" --rpc-url "$RPC")" != "0" ]; then
  echo "already deployed — $EXPLORER/address/$ADDR"
  exit 0
fi

# The factory takes salt ‖ initcode as raw calldata.
cast send "$FACTORY" "${SALT}${INIT#0x}" --rpc-url "$RPC" "${WALLET[@]}"

if [ "$(cast codesize "$ADDR" --rpc-url "$RPC")" = "0" ]; then
  echo "deploy transaction mined but no code at $ADDR" >&2
  exit 1
fi
echo "deployed  $EXPLORER/address/$ADDR"
