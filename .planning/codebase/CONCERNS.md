# Concerns

## 1. WalletConnect Missing Module Error
- **Symptom**: Console throws `[browser] ⨯ unhandledRejection: Error: Cannot find module '@walletconnect/ethereum-provider'` during dev server operation.
- **Cause**: RainbowKit / Wagmi default wallet connectors attempt to initialize WalletConnect in the background, but the dependency may be missing or failing to resolve in this Next.js version (16.3.5 / Turbopack).
- **Action**: Needs investigation if WalletConnect is strictly required, or if it can be disabled/installed.

## 2. GSAP / Lenis Hydration & Execution
- **Symptom**: Modifying DOM before hydration can cause React mismatch errors.
- **Mitigation**: `suppressHydrationWarning` is added to the `<body>` in `layout.tsx`. GSAP plugins are registered behind a `typeof window !== 'undefined'` check in `Landing.tsx`.

## 3. SDK Build Synchronization
- The `arc-preflight` SDK must be built *before* the Next.js app runs (`npm run predev`). Modifying SDK code requires a rebuild (`npm run sdk:build`) to reflect changes in the app, as Next.js consumes the `dist` output rather than hot-reloading the raw TypeScript source.
