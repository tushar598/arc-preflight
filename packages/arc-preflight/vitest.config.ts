import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 20_000, // Arc Testnet RPC can be slow
    hookTimeout: 10_000,
    include: ['tests/**/*.test.ts'],
  },
})
