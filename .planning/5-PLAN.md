# Phase 5 Plan: Demo Page Deployment

## Objective
Build and deploy a static demo page to Arc mainnet (via Vercel). The app will use Next.js, Tailwind CSS, Wagmi, and RainbowKit to demonstrate `arc-preflight` in a realistic web3 frontend.

---

## Phase 5 Deliverables Checklist

- [ ] Create `apps/demo` Next.js project
- [ ] Configure root `package.json` for npm workspaces
- [ ] Install `wagmi`, `viem`, `@rainbow-me/rainbowkit` in `apps/demo`
- [ ] Setup `src/app/providers.tsx` with Arc network definitions
- [ ] Build UI matching Arc L1 aesthetic (clean, minimalist, monochrome)
- [ ] Implement `PreflightForm` component that imports `preflight()`
- [ ] Implement "Gas Saved" counter
- [ ] Ensure `npm run build` works flawlessly from the workspace root

---

## Plan

### Task 1 — Monorepo Config
Update the root `package.json` (currently just a placeholder or non-existent workspace config) to:
```json
{
  "name": "arc-preflight-workspace",
  "private": true,
  "workspaces": [
    "packages/*",
    "apps/*"
  ],
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "test": "npm test --workspaces --if-present"
  }
}
```

### Task 2 — Bootstrap Next.js
Run: `npx -y create-next-app@latest apps/demo --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm`

### Task 3 — Dependencies
Inside `apps/demo`:
- Install Web3 deps: `npm install wagmi viem @tanstack/react-query @rainbow-me/rainbowkit`
- Link local SDK: `npm install arc-preflight` (npm will automatically link the local workspace package).

### Task 4 — Web3 Providers
Create `apps/demo/src/app/providers.tsx`. Configure Wagmi with `arc` and `arcTestnet` custom chains using the RPCs from `arc-preflight`.

### Task 5 — UI Development
Build out the interface in `apps/demo/src/app/page.tsx`:
1. **Header:** Logo + RainbowKit ConnectButton.
2. **Hero:** Clean typography explaining the value prop ("Stop paying gas for blocklisted transfers").
3. **Interactive Demo:** 
   - Input for recipient address.
   - Button "Simulate Transfer".
   - Under the hood, calls `preflight()`.
   - Results panel showing success/revert and estimated gas cost saved.
4. **Quick Actions:** "Fill with Blocked Address" (uses `MAINNET_DEMO_BLOCKED_ADDRESS`).

### Task 6 — Build Verification
Run `npm run build` at the root. Vercel automatically runs this command, which will first build `packages/arc-preflight` and then `apps/demo`.

---

## Verification Criteria (UAT)

1. Root `npm run build` completes successfully.
2. The demo app connects to a wallet via RainbowKit.
3. The demo app correctly catches the `MAINNET_DEMO_BLOCKED_ADDRESS` via the preflight check without prompting the user to sign a transaction.
4. UI matches the requested clean, professional aesthetic.
