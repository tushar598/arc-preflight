import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'es2020',
  },
  {
    entry: { bin: 'src/bin.ts' },
    format: ['esm'],
    target: 'es2020',
    // The bin imports ./cli.js which bundles everything it needs; keep it self-contained.
  },
])
