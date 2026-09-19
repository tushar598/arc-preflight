import { defineConfig } from 'vitest/config'

/**
 * Two projects:
 *   unit — fully offline, mocked RPC. Runs in CI.
 *   live — hits Arc Testnet. Opt in with LIVE_RPC=1 (npm run test:live).
 */
const live = process.env.LIVE_RPC === '1'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          testTimeout: 10_000,
        },
      },
      {
        test: {
          name: 'live',
          include: live ? ['tests/live/**/*.test.ts'] : [],
          testTimeout: 30_000,
          hookTimeout: 15_000,
        },
      },
    ],
  },
})
