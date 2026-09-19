import Link from 'next/link'
import { Preflight } from '@/components/Preflight'
import { WalletSend } from '@/components/WalletSend'
import { ARC_MAINNET_CHAIN_ID, sanctionsVersion } from 'arc-preflight'

const REPO = 'https://github.com/tushar598/arc-preflight'
const NPM = 'https://www.npmjs.com/package/arc-preflight'

export function Landing({ initialRecipient, autoRun }: { initialRecipient?: string; autoRun?: boolean }) {
  return (
    <>
      <header className="mast">
        <div className="wrap mast-inner">
          <Link href="/" className="mast-name">arc-preflight</Link>
          <nav className="mast-nav" aria-label="Links">
            <span className="live">Live on Arc mainnet (chain {ARC_MAINNET_CHAIN_ID})</span>
            <a href={NPM} target="_blank" rel="noreferrer">npm</a>
            <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
          </nav>
        </div>
      </header>

      <main className="wrap">
        <section className="hero">
          <h1>Know whether a USDC transfer will revert on Arc before you pay for it.</h1>
          <p>
            Arc enforces its blocklist at runtime, so a transfer to a sanctioned address is included, reverts, and still costs gas.
            arc-preflight simulates the transfer with one <code>eth_call</code> and tells you first. No backend, no API key.
          </p>
        </section>

        <Preflight initialRecipient={initialRecipient} autoRun={autoRun} />

        <section className="section" id="how">
          <h2>What runs when you press the button</h2>
          <p className="lede">
            Four layers, cheapest first. The first three can only prove a blocklist hit; the simulation is ground truth and also
            catches the zero address, precompile destinations and forbidden burns.
          </p>
          <ol className="steps">
            <li>
              <span className="n">1</span>
              <div>
                <b>OFAC SDN snapshot</b>
                <p>An embedded list of Ethereum addresses from the US Treasury SDN list (snapshot {sanctionsVersion}, refreshed weekly by CI). Synchronous, no network. OFAC only, not EU or UN.</p>
              </div>
            </li>
            <li>
              <span className="n">2</span>
              <div>
                <b>Local blocklist event cache</b>
                <p>Optional. Backfills USDC <code>Blacklisted</code> / <code>UnBlacklisted</code> events with <code>eth_getLogs</code> and then watches for new ones, so repeat checks against known-bad addresses skip the RPC.</p>
              </div>
            </li>
            <li>
              <span className="n">3</span>
              <div>
                <b>USDC.isBlacklisted()</b>
                <p>The check Arc’s own docs tell exchanges to run before withdrawals. One view call to the USDC predeploy at <code>0x3600…0000</code>, for both sender and recipient.</p>
              </div>
            </li>
            <li>
              <span className="n">4</span>
              <div>
                <b>Native send simulation</b>
                <p>
                  <code>eth_call</code> of a native USDC send with a virtual sender balance via <code>stateOverride</code>. This is the same path a real transaction takes, so the runtime transfer check fires exactly as it would on-chain, without a funded account.
                  Calldata is decoded too: an ERC-20 <code>transfer()</code>, a <code>Memo.memo()</code> wrapper or a <code>Multicall3From.aggregate3()</code> batch has every inner recipient checked.
                </p>
              </div>
            </li>
          </ol>
        </section>

        <section className="section" id="wallet">
          <h2>Then try it against the real chain</h2>
          <p className="lede">Optional. Connect a wallet on Arc Testnet, send with the guard on, then send with it off and watch the revert land on the explorer.</p>
          <WalletSend />
        </section>

        <section className="section" id="install">
          <h2>Two lines to add it</h2>
          <p className="lede">Wrap your wallet client. Every <code>sendTransaction</code> is checked first; a blocked one throws before broadcast.</p>
          <pre className="code">{`npm i arc-preflight viem

`}<span className="k">import</span>{` { withPreflight, PreflightError } `}<span className="k">from</span> <span className="s">&apos;arc-preflight&apos;</span>{`

`}<span className="k">const</span>{` wallet = withPreflight(walletClient, publicClient)

`}<span className="k">try</span>{` {
  `}<span className="k">await</span>{` wallet.sendTransaction({ to, value })
} `}<span className="k">catch</span>{` (err) {
  `}<span className="k">if</span>{` (err `}<span className="k">instanceof</span>{` PreflightError) {
    `}<span className="c">{`// err.reasonCode: BLOCKLIST | ZERO_ADDRESS | PRECOMPILE | …`}</span>{`
    `}<span className="c">{`// err.layer:      sanctions | cache | isBlacklisted | simulation`}</span>{`
  }
}

`}<span className="c">{`# or from a shell, no code at all`}</span>{`
npx arc-preflight 0xd882cFc20F52f2599D84b8e8D58C7FB62cfE344b`}</pre>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap foot-inner">
          <span>arc-preflight, MIT license</span>
          <span style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <a href={NPM} target="_blank" rel="noreferrer">npm: arc-preflight</a>
            <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
            <a href={`${REPO}/blob/main/docs/limitations.md`} target="_blank" rel="noreferrer">Limitations</a>
            <a href={`${REPO}/blob/main/JUDGES.md`} target="_blank" rel="noreferrer">For judges</a>
          </span>
          <span>Live on Arc mainnet, chain {ARC_MAINNET_CHAIN_ID}. Built for the Arc Microgrants (Circle × DoraHacks).</span>
        </div>
      </footer>
    </>
  )
}
