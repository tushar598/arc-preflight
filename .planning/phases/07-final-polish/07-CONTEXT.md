# Phase 7: Final Polish & Publication

## Domain
Finalize all remaining documentation and prepare the SDK for publication.

## Canonical Refs
- `ROADMAP.md`

## Decisions
### Documentation
- **`data-sources.md`**: Document sanction list sources (OFAC SDN, EU, UN), update frequency, and format.
- **`limitations.md`**: Document known limitations (zero-value skips, native-only, testnet blocklist scope, no routed-tx attribution).
- **Scope**: Ethers adapter already exists from Phase 2. READMEs already exist. Focus on the two missing doc files and npm publish readiness.

### Publication
- **npm publish**: Build with `tsup`, verify `dist/` output, dry-run publish. Skip actual `npm publish` since the user will handle credentials.
- **Repository**: Ensure `package.json` has `repository`, `homepage`, and `bugs` fields for npm registry.

## Deferred Ideas
- None
