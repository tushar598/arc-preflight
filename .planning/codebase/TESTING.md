# Testing

## Static Analysis
- **TypeScript**: Validated via `npm run typecheck` (`tsc --noEmit -p tsconfig.json`).
- **ESLint**: Validated via `npm run lint`.

## SDK Testing
The `arc-preflight` package contains its own test suite:
- `npm run sdk:test`: Runs unit tests for the SDK.
- `npm run sdk:test:live`: Runs live integration tests against an actual RPC.

## Application Testing
- Currently relies on manual testing of the `Preflight.tsx` and `WalletSend.tsx` flows.
- The `/demo` route serves as an automated visual test case by running a mainnet blocklist simulation on load.
