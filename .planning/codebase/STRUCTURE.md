# Structure

## Directory Layout
- **`app/`**: Next.js App Router root.
  - `page.tsx`: Entry point rendering the Landing component.
  - `layout.tsx`: Root layout with font imports and `Providers`.
  - `globals.css`: Global styles, Tailwind base, and dark mode developer-tool aesthetic overrides.
  - `providers.tsx`: RainbowKit and Wagmi context providers.
  - `demo/page.tsx`: Demo deep-link that auto-runs a blocked address check.

- **`components/`**: React UI components.
  - `Landing.tsx`: The main landing page, containing GSAP animations and section layout.
  - `Preflight.tsx`: The interactive blocklist simulation tool.
  - `WalletSend.tsx`: The active wallet connection and transaction execution test tool.

- **`lib/`**: Utilities.
  - `chains.ts`: Custom chain definitions for Arc Network.

- **`packages/arc-preflight/`**: The core SDK logic (monorepo structure).
  - Built with `tsup`. Contains the validation rules, simulation logic, and OFAC lists.

- **`.planning/`**: GSD planning directory with phase contexts, PRDs, and historical logs.
