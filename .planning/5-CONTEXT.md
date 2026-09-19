# Phase 5 Context: Demo Page Deployment

## Summary

Phase 5 builds a user-facing demo application for `arc-preflight`. It will visually demonstrate how the SDK catches blocklisted transfers before gas is spent, displaying a "Gas Saved" counter to show the real-world value of the SDK.

---

## Decisions Locked

### Tech Stack
- **Framework:** Next.js (App Router) initialized in `apps/demo`.
- **Styling:** Tailwind CSS (specifically requested by the user, overriding the default Vanilla CSS rule for this component).
- **Web3 Connection:** Wagmi + RainbowKit for a premium, reliable wallet connection experience.
- **Package Management:** The monorepo structure will be preserved. `apps/demo` will import `arc-preflight` from the local workspace.

### Design Aesthetic
- **Visual Language:** Arc L1 Official Website UI.
  - Institutional-grade, professional, minimalist, and clean.
  - Trust-based financial OS aesthetic (high readability, solid structural layouts).
  - Colors: Clean monochromes with strong, reliable accents (avoiding overly chaotic or neon crypto tropes).

### Deployment
- **Platform:** Vercel.
- **Configuration:** standard Next.js deployment. We will ensure the `build` script in `package.json` correctly builds the workspace dependencies (`arc-preflight`) before building the Next.js app so Vercel deployment works seamlessly.

### Features
1. **Wallet Connection:** RainbowKit Connect Wallet button.
2. **Transfer Simulation:** A UI form to enter a recipient address and a simulated value.
3. **Preflight Hook:** The form will use `withPreflight()` (via a Wagmi adapter or wrapped viem client) or just call `preflight()` directly to show the result.
4. **Gas Saved Metric:** A visual counter that tracks how much gas (in USDC value) was saved by blocking reverted transactions.
5. **Quick-Test Buttons:** Buttons to autofill the `MAINNET_DEMO_BLOCKED_ADDRESS` and a known safe address for one-click testing.

---

## Out of Scope for Phase 5
- Agent/AI integration (handled in Phase 6).
- npm registry publication (handled in Phase 7).
