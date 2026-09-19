# Project: arc-preflight

## Overview
A zero-infrastructure preflight check that tells you a USDC transfer on Arc will revert — before you pay gas to find out.

## Objective
Build one small npm package (`arc-preflight`) that simulates a USDC transfer on Arc using `eth_call` before it's actually submitted, allowing developers or autonomous agents to know if a transfer will hit Arc's runtime blocklist check and revert, without spending gas.

## Target Audience & Goal
- **Target:** Arc Microgrants — Circle × DoraHacks (20 grants × 500 USDC from a 10,000 USDC pool).
- **Deadline:** Submissions close October 14, 2026, 23:59 ET.
- **Goal:** Ship a live Arc-mainnet deployment link + public repo (MIT Licensed). Testnet-only builds are not eligible.

## Architecture
- **NPM Package:** `arc-preflight` with `preflight()` and `withPreflight()` functions.
- **Sanctions Data:** Embedded, versioned JSON snapshot (OFAC/EU/UN) updated via scheduled GitHub Action.
- **Demo Page:** Static page deployed to Arc mainnet.
- **No Backend:** No database, no hosted API, no API keys.
