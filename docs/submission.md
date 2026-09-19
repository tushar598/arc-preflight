# DoraHacks BUIDL blurb

**arc-preflight — the pre-send compliance probe for Arc.**

Arc enforces its USDC blocklist at runtime: a transfer to a sanctioned address is included, reverts, and still burns gas. arc-preflight is a zero-infrastructure npm package and CLI that tells you first. It layers an offline OFAC SDN snapshot, a local `Blacklisted`-event cache, `USDC.isBlacklisted()` on the `0x3600…0000` predeploy, and an `eth_call` simulation of the native USDC send with `stateOverride` — the exact path a real transaction takes — so it also catches zero-address, precompile and forbidden-burn reverts. It decodes ERC-20, `Memo` and `Multicall3From` calldata, attributing inner transfers to the original sender via CallFrom, so a batch payroll with one bad payee is stopped whole. Viem and ethers adapters wrap any wallet client in one line. Live on Arc mainnet over the public RPC, no backend, MIT.

*(≈130 words)*

## Links

- Live demo: `https://arc-preflight.vercel.app` (`/demo` for the one-click blocked path)
- Repo: https://github.com/tushar598/arc-preflight
- npm: https://www.npmjs.com/package/arc-preflight
- 90-second walkthrough video: *(add Loom link)*

## Tags

Arc · USDC · compliance · blocklist · OFAC · viem · ethers · agents · developer tooling
