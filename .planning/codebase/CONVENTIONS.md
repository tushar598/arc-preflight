# Conventions

## Code Style
- **TypeScript**: Strict typing is enforced. Components define prop interfaces inline.
- **Client Components**: Files using hooks, browser APIs, or GSAP/Lenis must include the `'use client'` directive at the top.
- **Tailwind CSS**: Utility classes are used for standard styling. Custom variables and specific component structures (`.probe`, `.wallet`) are maintained in `globals.css` to keep the HTML clean.

## Design Aesthetic
- **Theme**: Dark mode by default (`#0A0E1A` background). Clean, professional developer tool aesthetic.
- **Typography**: IBM Plex Sans for body, IBM Plex Mono for code/addresses.
- **Interactions**: Subtle hover states, pill-shaped buttons, and smooth scrolling via Lenis.

## Imports
- Absolute imports (`@/components/...`) used for local source files.

## Workspaces
- SDK code is separated into `packages/arc-preflight`. It is built independently (`npm run sdk:build`) before the Next.js app starts.
