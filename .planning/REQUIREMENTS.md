# Requirements: arc-preflight

## Core Features
1. **eth_call Preflight Probe (Primary):**
   - Probe runtime transfer-check rule using `eth_call`.
   - Must return if the transfer will revert due to blocklist.

2. **Public Sanctions Data (Baseline):**
   - Provide a baseline check against OFAC SDN, EU, and UN lists.
   - Shipped as versioned JSON snapshot within the package.
   - Updated by a scheduled GitHub Action.

3. **Local Blocklist Cache (Secondary, Optional):**
   - Subscribe to `Blocklisted`/`UnBlocklisted` events on USDC contract.
   - Maintain a local cache for high-frequency callers.

4. **SDK Adapters:**
   - **Viem:** Primary adapter.
   - **Ethers:** Secondary adapter.

5. **Demo Application:**
   - Static demo page on Arc mainnet.
   - Includes live preflight check, "USDC gas saved" counter.
   - Testnet "send anyway" button showing actual revert.

6. **Agent Middleware:**
   - `withPreflight` middleware wrapping a wallet client.
   - Example script using the middleware.

## Technical Constraints
- **Language:** TypeScript (`^7.0.2`).
- **Chain Interaction:** viem (`^2.56.8`), ethers (`^6.17.0`).
- **Bundler:** tsup (`^8.5.1`).
- **Testing:** vitest (`^5.0.1`) against `arc-anvil`.
- **Package Manager:** npm workspaces.
- **Hosting:** Static hosting (Vercel/Netlify/Cloudflare Pages).
- **CI/CD:** GitHub Actions.

## Out of Scope
- Hosted API, database, dashboard, API keys, billing.
- On-chain oracle contract.
- KYC, custody.
- Routed-transaction (Memo/Multicall3From) attribution.
- Proprietary risk graph, multi-hop tracing, mixer-exposure scoring.
