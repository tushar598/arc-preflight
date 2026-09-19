#!/usr/bin/env node
import { main } from './cli.js'

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('arc-preflight:', err instanceof Error ? err.message : err)
    process.exit(2)
  })
