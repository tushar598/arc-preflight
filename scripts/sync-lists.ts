/**
 * sync-lists.ts
 *
 * Fetches the OFAC SDN XML and extracts all Ethereum addresses,
 * writing them to packages/arc-preflight/data/sanctions.json.
 *
 * Usage:
 *   npx tsx scripts/sync-lists.ts
 *
 * Run this manually or via the GitHub Action (.github/workflows/sync-sanctions.yml)
 * which runs weekly (Monday 06:00 UTC), on PR merge, and on manual dispatch.
 *
 * Scope: OFAC SDN "Digital Currency Address - ETH" entries ONLY. No EU / UN lists.
 *
 * Source: https://sanctionslistservice.ofac.treas.gov (OFAC Sanctions List Service)
 */

import { writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const OFAC_URL =
  'https://sanctionslistservice.ofac.treas.gov/api/publicationpreview/exports/sdn.xml'

const OUTPUT_PATH = resolve(
  __dirname,
  '../packages/arc-preflight/data/sanctions.json',
)

// ---------------------------------------------------------------------------
// Fetch + parse
// ---------------------------------------------------------------------------

async function fetchOfacXml(): Promise<string> {
  console.log('Fetching OFAC SDN XML from:', OFAC_URL)

  const res = await fetch(OFAC_URL, {
    headers: {
      'User-Agent': 'arc-preflight/sanctions-sync (github.com/arc-preflight)',
    },
  })

  if (!res.ok) {
    throw new Error(
      `OFAC fetch failed: HTTP ${res.status} ${res.statusText}`,
    )
  }

  const text = await res.text()
  console.log(`Downloaded ${(text.length / 1024).toFixed(0)} KB`)
  return text
}

/**
 * Extract all Ethereum addresses from OFAC SDN XML.
 *
 * The XML format for crypto entries:
 * <id>
 *   <idType>Digital Currency Address - ETH</idType>
 *   <idNumber>0xabc123...</idNumber>
 * </id>
 */
function extractEthAddresses(xml: string): string[] {
  const addresses = new Set<string>()

  // Match ETH digital currency address blocks
  // Pattern covers optional whitespace and CRLF (the OFAC XML uses \r\n)
  const pattern =
    /Digital Currency Address - ETH<\/idType>[\s\S]*?<idNumber>(0x[a-fA-F0-9]{40})<\/idNumber>/gi

  let match: RegExpExecArray | null
  while ((match = pattern.exec(xml)) !== null) {
    const addr = match[1].toLowerCase()
    addresses.add(addr)
  }

  return Array.from(addresses).sort()
}

/**
 * Extract the publication date from the OFAC SDN XML.
 */
function extractPublishDate(xml: string): string {
  const match = xml.match(/<Publish_Date>([\d/]+)<\/Publish_Date>/)
  if (match?.[1]) {
    // Convert MM/DD/YYYY → YYYY-MM-DD
    const parts = match[1].split('/')
    if (parts.length === 3) {
      return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`
    }
    return match[1]
  }
  return new Date().toISOString().split('T')[0]
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n══════════════════════════════════════════════')
  console.log('   arc-preflight | OFAC Sanctions List Sync')
  console.log('══════════════════════════════════════════════\n')

  const xml = await fetchOfacXml()
  const addresses = extractEthAddresses(xml)
  const version = extractPublishDate(xml)

  console.log(`Extracted ${addresses.length} Ethereum addresses`)
  console.log(`OFAC publish date: ${version}`)

  if (addresses.length === 0) {
    console.error('\n⚠️  WARNING: No Ethereum addresses found in the XML.')
    console.error(
      '   This may indicate a format change in the OFAC data source.',
    )
    console.error('   Aborting — existing sanctions.json left unchanged.')
    process.exit(1)
  }

  // Verify our known mainnet demo address is present
  const DEMO_ADDR = '0xd882cfc20f52f2599d84b8e8d58c7fb62cfe344b'
  if (!addresses.includes(DEMO_ADDR)) {
    console.warn(
      `\n⚠️  WARNING: MAINNET_DEMO_BLOCKED_ADDRESS (${DEMO_ADDR}) not found in list.`,
    )
    console.warn('   It may have been removed from OFAC — check the SDK constant.')
  } else {
    console.log(`✓  MAINNET_DEMO_BLOCKED_ADDRESS present in list`)
  }

  const output = {
    version,
    source: 'OFAC SDN (Specially Designated Nationals List)',
    scope: 'OFAC SDN Digital Currency Address - ETH only',
    description:
      'Ethereum wallet addresses from the US OFAC SDN list. ' +
      'Generated automatically. Do not edit manually.',
    count: addresses.length,
    addresses,
  }

  // Ensure the data directory exists
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true })

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8')

  console.log(`\n✅ Written to: ${OUTPUT_PATH}`)
  console.log(`   ${addresses.length} addresses | version ${version}`)
  console.log('\n══════════════════════════════════════════════\n')
}

main().catch((err) => {
  console.error('\n❌ Fatal error:', err.message || err)
  process.exit(1)
})
