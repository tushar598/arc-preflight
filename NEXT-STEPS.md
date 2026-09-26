# Next steps: test, deploy, publish, submit

Everything below assumes you are at the repo root on `main` with Node ≥ 20 and npm ≥ 10.

```bash
git pull
npm ci        # .npmrc sets legacy-peer-deps for the RainbowKit 2 / wagmi 3 pair
```

---

## 1. Test what exists

### 1a. SDK — offline unit tests (no network, ~1 s)

```bash
npm run sdk:test
```

Expect `Tests 79 passed (79)`. These run against a fake Arc RPC (`packages/arc-preflight/tests/helpers/fakeArc.ts`) that reproduces the real error shapes, so they cover: safe / blocked / zero-address / precompile verdicts, every layer short-circuit, `stateOverride` rejection fallback, gas-estimate fallback, revert-reason tiers, calldata decoding (ERC-20, EIP-3009, Memo, all Multicall3From variants, nested), `withPreflight` / `withPreflightEthers` blocking before the wallet is called, cache backfill chunking, and the CLI.

### 1b. SDK — live tests against Arc Testnet (~15 s, needs internet)

```bash
npm run contracts:build    # the payout live test injects the compiled contract via stateOverride
npm run sdk:test:live
```

Expect `Tests 11 passed (11)`. Proves the engine against the real runtime: the seeded testnet blocklisted address, the zero address, a `value: 0` ERC-20 `transfer()` to a blocked address, `preflightMany`, and both adapters' guarded clients.

### 1b′. Contract — Foundry tests (needs `foundryup`)

```bash
npm run contracts:test     # 12 tests: skip-and-refund, runtime rejection, precompiles, hostile payees, validation
```

### 1c. SDK — typecheck and build

```bash
npm run sdk:typecheck
npm run sdk:build          # → packages/arc-preflight/dist/{index.js,index.cjs,index.d.ts,bin.js}
```

### 1d. CLI against Arc mainnet (after `sdk:build`)

```bash
node packages/arc-preflight/dist/bin.js 0xd882cFc20F52f2599D84b8e8D58C7FB62cfE344b          # BLOCKED, BLOCKLIST, layer sanctions, exit 1
node packages/arc-preflight/dist/bin.js 0x1111111111111111111111111111111111111111          # SAFE, 21000 gas live, exit 0
node packages/arc-preflight/dist/bin.js 0x0000000000000000000000000000000000000000          # BLOCKED, ZERO_ADDRESS, layer simulation
node packages/arc-preflight/dist/bin.js 0x1800000000000000000000000000000000000001          # BLOCKED, PRECOMPILE
node packages/arc-preflight/dist/bin.js 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 --chain testnet --json
```

After publishing (step 3) the same thing is `npx arc-preflight <address>`.

### 1e. Agent example (live, testnet)

```bash
npx tsx packages/arc-preflight/examples/agent/run.ts
```

Expect: 3 payees screened (1 blocked), then the loop shows `worker-2` and `batch-4` (an `aggregate3` batch with a blocked recipient hidden inside) **stopped before broadcast** with `BLOCKLIST via isBlacklisted`, while the clean payees are rejected by the RPC for lack of balance — the wallet is random and unfunded on purpose.

### 1f. Demo app locally

```bash
npm run dev                # builds the SDK first, then Next.js on http://localhost:3000
```

Check, in order:

1. **`/demo`** — loads with the mainnet blocked address pre-filled and runs on its own. You should see `BLOCKED · BLOCKLIST`, row 1 (OFAC SDN snapshot) lit red with "blocked here", rows 2–4 "not needed", and "Gas you did not spend 34,000 ≈ 0.00068 USDC". No wallet connected.
2. Press **Clean address → Run preflight** — all four rows "clear", `SAFE`, live gas estimate 21,000.
3. Press **Zero address → Run preflight** — rows 1–3 clear, row 4 lit, `BLOCKED · ZERO_ADDRESS`, reason "Zero address not allowed".
4. Toggle **Testnet** — the blocked chip changes to the testnet address; run it — `BLOCKED` from layer `isBlacklisted`.
5. Session tally under the card increments per blocked check.
6. Resize to phone width — no horizontal scroll (verified at 390 px).

### 1g. Wallet flow (optional, needs a funded Arc Testnet wallet)

Get testnet USDC from the Arc faucet (https://faucet.circle.com, select Arc Testnet), connect with MetaMask/Rabby on chain 5042002, then in *Then try it against the real chain*:

- **Send 0.001 USDC with preflight** → "Stopped before broadcast … Gas spent: 0".
- **Send anyway, skip preflight** → confirm the dialog → explorer link appears → after the receipt: "Included and reverted. Gas consumed: N ≈ X USDC". If Arc returns no receipt for a blocklist revert the UI says "Waiting for the receipt…" with the explorer link; the explorer is the source of truth.

On mainnet both buttons are replaced by a "Switch to Arc Testnet" prompt. The bypass never runs on mainnet.

### 1h. App lint / typecheck / production build

```bash
npm run lint
npm run typecheck
npm run build              # SDK + Next.js; routes / and /demo prerender as static
```

### 1i. CI

`.github/workflows/ci.yml` runs on every PR and push to `main`: SDK typecheck → unit tests → build → CLI smoke → `npm pack --dry-run`, and app lint → typecheck → build. The live-testnet job only runs on manual dispatch (Actions tab → CI → Run workflow).

`.github/workflows/sync-sanctions.yml` refreshes `data/sanctions.json` every Monday 06:00 UTC and commits if it changed. Trigger it once by hand (Actions → Sync OFAC Sanctions List → Run workflow) to confirm it has `contents: write` on this repo.

---

### 1j. Deploy PreflightPayout (once per network)

**Done on both networks (2026-09-26 mainnet, 2026-09-23 testnet).** These commands are kept for reference; re-running them only prints "already deployed".

The address is fixed by CREATE2: `0xDcCa5d6603Eb63241763665DB4c95f8c8d51BcDA`. Use a wallet with a little USDC for gas (testnet: https://faucet.circle.com).

```bash
PRIVATE_KEY=0x… npm run contracts:deploy -- testnet
PRIVATE_KEY=0x… npm run contracts:deploy -- mainnet      # optional; costs a few cents
```

The script prints the explorer link and exits "already deployed" if the code is already there. No SDK or app change is needed: both already point at the address. The demo's payout section shows live stats as soon as the code exists.

## 2. Deploy the demo (Vercel)

1. https://vercel.com/new → import `tushar598/arc-preflight`.
2. Framework preset: **Next.js** (auto-detected). Root directory: leave as repo root.
3. Build command: `npm run build` (this builds the SDK and then the app; the default `next build` alone would fail because `dist/` is not committed). Install command: `npm ci` (the `.npmrc` is honoured).
4. Environment variables: none required. Optional `NEXT_PUBLIC_WALLETCONNECT_ID` = a project ID from https://cloud.walletconnect.com if you want WalletConnect QR connections in the wallet section; injected wallets (MetaMask, Rabby) work without it.
5. Deploy. Open `https://<project>.vercel.app/demo` and repeat check 1f.1 — it must show `BLOCKED` on mainnet without a wallet.
6. Put the final URL in three places and commit:
   - `README.md` (line under the title)
   - `JUDGES.md` (first line)
   - `docs/submission.md` (Links)

   ```bash
   grep -rn "arc-preflight.vercel.app" README.md JUDGES.md docs/submission.md
   ```

Any other static host works the same way (Netlify, Cloudflare Pages): Node 20+, build `npm run build`, no env.

---

## 3. Publish the SDK to npm

Pre-flight (pun intended):

```bash
cd packages/arc-preflight
npm whoami                                   # must be logged in; otherwise: npm login
npm view arc-preflight version 2>/dev/null   # confirm the name is free or shows the previous version
npm pack --dry-run                           # expect 10 files, ~93 kB: README, LICENSE, data/sanctions.json, dist/*, package.json
```

Publish:

```bash
npm version 0.1.0 --no-git-tag-version   # or the version you want; bump for every publish
npm publish --access public              # prepublishOnly runs typecheck + unit tests + build first
```

Verify:

```bash
npm view arc-preflight
cd /tmp && mkdir p && cd p && npm init -y >/dev/null && npm i arc-preflight viem
npx arc-preflight 0xd882cFc20F52f2599D84b8e8D58C7FB62cfE344b     # BLOCKED, exit 1
node -e "import('arc-preflight').then(m=>console.log(Object.keys(m).length,'exports, sanctions',m.sanctionsVersion))"
```

Then commit the version bump and tag:

```bash
cd -   # back to the repo
git add packages/arc-preflight/package.json package-lock.json
git commit -m "chore(release): arc-preflight v0.1.0"
git tag v0.1.0 && git push && git push --tags
```

If you want npm to require 2FA / provenance later: `npm publish --provenance` from a GitHub Actions job with `id-token: write`. Not needed for the grant.

---

## 4. Submit to DoraHacks

1. Record the 90-second walkthrough. Script = the click path in `JUDGES.md`: open `/demo` (BLOCKED on mainnet, no wallet) → Clean address → Zero address → show the CLI in a terminal → 10 s on the `withPreflight` snippet. Loom or QuickTime is fine.
2. https://dorahacks.io → Arc Microgrants hackathon → **Submit BUIDL**.
   - Title: `arc-preflight`
   - Description: paste `docs/submission.md` (the ~130-word blurb), then the links block.
   - Repo: `https://github.com/tushar598/arc-preflight` (must be public — see step 5)
   - Demo URL: the Vercel URL, ideally with `/demo`
   - Video: the Loom link
   - Tags: from `docs/submission.md`
3. Deadline: **2026-10-14 23:59 ET**. Review is rolling, so earlier is better.

---

## 5. Before the deadline — checklist

- [ ] Repo is **public** (`gh repo edit tushar598/arc-preflight --visibility public`). It is private right now; the grant requires public + MIT.
- [ ] `main` is green in the Actions tab.
- [x] PreflightPayout deployed on Arc mainnet and testnet (`npm run contracts:deploy -- testnet`); the demo's payout section shows live stats, not "Not deployed". Run one batch so the counters are non-zero.
- [ ] Vercel `/demo` shows BLOCKED on mainnet in a fresh incognito window.
- [ ] `npx arc-preflight 0xd882cFc20F52f2599D84b8e8D58C7FB62cfE344b` works from an empty directory.
- [ ] README / JUDGES.md / submission.md carry the real demo URL and the Loom link.
- [ ] Sanctions sync workflow has run at least once successfully.

---

## 6. Nice-to-have after submission

- Add `NEXT_PUBLIC_WALLETCONNECT_ID` on Vercel so mobile wallets can connect via QR.
- Run the wallet bypass flow once on testnet and paste the reverted tx hash into `JUDGES.md` as proof of the gas-consumed revert.
- Turn on branch protection for `main` requiring the CI workflow.
- Bump the vitest `live` project into a nightly schedule if you want continuous proof against the real chain.
