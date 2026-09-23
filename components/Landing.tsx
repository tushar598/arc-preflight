'use client'

import { useEffect, useRef } from 'react'
import { Preflight } from '@/components/Preflight'
import { WalletSend } from '@/components/WalletSend'
import { Payout } from '@/components/Payout'
import { ARC_MAINNET_CHAIN_ID, sanctionsVersion } from 'arc-preflight'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { ExternalLink, Terminal, Shield, Zap, Layers } from 'lucide-react'

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger)
}

const REPO = 'https://github.com/tushar598/arc-preflight'
const NPM = 'https://www.npmjs.com/package/arc-preflight'

export function Landing({ initialRecipient, autoRun }: { initialRecipient?: string; autoRun?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    })

    lenis.on('scroll', () => ScrollTrigger.update())

    const updateLenis = (time: number) => { lenis.raf(time * 1000) }
    gsap.ticker.add(updateLenis)
    gsap.ticker.lagSmoothing(0)

    const ctx = gsap.context(() => {
      // Hero entrance
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
      tl.from('.hero-badge', { opacity: 0, y: -16, duration: 0.7, delay: 0.05 })
        .from('.hero-title', { opacity: 0, y: 24, duration: 0.9 }, '-=0.4')
        .from('.hero-sub', { opacity: 0, y: 16, duration: 0.7 }, '-=0.5')
        .from('.hero-links', { opacity: 0, y: 12, duration: 0.6 }, '-=0.4')
        .from('.hero-tool', { opacity: 0, y: 30, duration: 1 }, '-=0.5')

      // Section reveals
      gsap.utils.toArray<Element>('.reveal').forEach((el) => {
        gsap.from(el, {
          scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none reverse' },
          y: 30, opacity: 0, duration: 0.8, ease: 'power2.out',
        })
      })
    }, containerRef)

    return () => { ctx.revert(); gsap.ticker.remove(updateLenis); lenis.destroy() }
  }, [])

  return (
    <div ref={containerRef} className="min-h-screen bg-[#0A0E1A] text-[#E2E8F0] font-sans antialiased">

      {/* ─── Top bar ─── */}
      <header className="border-b border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
          <span className="text-sm font-semibold tracking-tight text-white">arc-preflight</span>
          <nav className="flex items-center gap-5 text-xs text-[#94A3B8]">
            <span className="hidden sm:inline-flex items-center gap-1.5">
              <span className="w-[6px] h-[6px] rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)]" />
              Arc mainnet · chain {ARC_MAINNET_CHAIN_ID}
            </span>
            <a href={NPM} target="_blank" rel="noreferrer" className="hover:text-white transition-colors">npm</a>
            <a href={REPO} target="_blank" rel="noreferrer" className="hover:text-white transition-colors flex items-center gap-1">
              GitHub <ExternalLink className="w-3 h-3" />
            </a>
          </nav>
        </div>
      </header>

      {/* ─── Hero + Tool ─── */}
      <main className="max-w-5xl mx-auto px-5">

        <section className="pt-16 pb-6 sm:pt-20 sm:pb-8">
          {/* Badge */}
          <div className="hero-badge inline-flex items-center gap-1.5 font-mono text-[11px] tracking-widest uppercase text-amber-400/90 mb-5">
            <span className="text-amber-400/50">[</span> PREFLIGHT CHECK <span className="text-amber-400/50">]</span>
          </div>

          {/* Headline */}
          <h1 className="hero-title text-[clamp(26px,5vw,42px)] font-semibold leading-[1.15] tracking-[-0.025em] text-white max-w-[22ch] mb-4">
            Know if a USDC transfer will revert on Arc, before you pay gas.
          </h1>

          {/* Subtitle */}
          <p className="hero-sub text-[15px] sm:text-base text-[#94A3B8] leading-relaxed max-w-lg mb-5">
            Simulates Arc&apos;s blocklist and native transfer rules with one&nbsp;
            <code className="text-sky-400/80 text-[13px] bg-white/[0.04] px-1.5 py-0.5 rounded">eth_call</code>.
            No backend. No API key. OFAC snapshot v{sanctionsVersion}.
          </p>

          {/* Links */}
          <div className="hero-links flex flex-wrap items-center gap-3 text-xs mb-14">
            <a href="#how" className="px-3.5 py-1.5 rounded-md bg-white/[0.06] hover:bg-white/[0.1] text-[#CBD5E1] border border-white/[0.08] transition-colors">
              How it works ↓
            </a>
            <a href="#wallet" className="px-3.5 py-1.5 rounded-md bg-white/[0.06] hover:bg-white/[0.1] text-[#CBD5E1] border border-white/[0.08] transition-colors">
              Test on chain ↓
            </a>
            <a href="#payout" className="px-3.5 py-1.5 rounded-md bg-white/[0.06] hover:bg-white/[0.1] text-[#CBD5E1] border border-white/[0.08] transition-colors">
              Batch payouts ↓
            </a>
            <a href="#install" className="px-3.5 py-1.5 rounded-md bg-white/[0.06] hover:bg-white/[0.1] text-[#CBD5E1] border border-white/[0.08] transition-colors">
              Install ↓
            </a>
          </div>

          {/* ─── Preflight Tool (the star of the page) ─── */}
          <div className="hero-tool">
            <Preflight initialRecipient={initialRecipient} autoRun={autoRun} />
          </div>
        </section>

        {/* ─── How it works (compact) ─── */}
        <section id="how" className="reveal pt-16 pb-10 border-t border-white/[0.06]">
          <h2 className="text-lg font-semibold text-white tracking-tight mb-1.5">What runs when you press the button</h2>
          <p className="text-sm text-[#64748B] mb-8 max-w-lg">
            Four layers, cheapest first. The first three prove a blocklist hit; the simulation is ground truth.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([
              { n: '1', icon: Shield, title: 'OFAC SDN snapshot', desc: `Embedded address list (v${sanctionsVersion}). Synchronous, no network.`, tag: 'OFFLINE' },
              { n: '2', icon: Layers, title: 'Blocklist event cache', desc: 'Backfills USDC Blacklisted/UnBlacklisted events via eth_getLogs.', tag: 'LOCAL' },
              { n: '3', icon: Terminal, title: 'USDC.isBlacklisted()', desc: 'One view call to the USDC predeploy for sender + recipient.', tag: 'VIEW CALL' },
              { n: '4', icon: Zap, title: 'Native send simulation', desc: 'eth_call with virtual balance via stateOverride. Ground truth.', tag: 'SIMULATION' },
            ] as const).map(({ n, icon: Icon, title, desc, tag }) => (
              <div key={n} className="flex gap-3.5 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.1] transition-colors">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-mono font-bold text-blue-400">{n}</span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[13px] font-medium text-white">{title}</span>
                    <span className="text-[10px] font-mono text-[#64748B] bg-white/[0.04] px-1.5 py-0.5 rounded">{tag}</span>
                  </div>
                  <p className="text-xs text-[#64748B] leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Wallet Send ─── */}
        <section id="wallet" className="reveal pt-10 pb-10 border-t border-white/[0.06]">
          <h2 className="text-lg font-semibold text-white tracking-tight mb-1.5">Try it on-chain</h2>
          <p className="text-sm text-[#64748B] mb-6 max-w-lg">
            Connect a wallet on Arc Testnet. Send with the guard on, then bypass it and watch the revert on the explorer.
          </p>
          <WalletSend />
        </section>

        {/* ─── Batch payouts (PreflightPayout contract) ─── */}
        <section id="payout" className="reveal pt-10 pb-10 border-t border-white/[0.06]">
          <h2 className="text-lg font-semibold text-white tracking-tight mb-1.5">Pay many, skip the bad ones</h2>
          <p className="text-sm text-[#64748B] mb-6 max-w-lg">
            One blocked payee reverts a normal batch and you lose the gas for all of them. PreflightPayout
            pays everyone Arc accepts and refunds the rest in the same transaction. Preflight predicts the split;
            the contract enforces it.
          </p>
          <Payout />
        </section>

        {/* ─── Install ─── */}
        <section id="install" className="reveal pt-10 pb-20 border-t border-white/[0.06]">
          <h2 className="text-lg font-semibold text-white tracking-tight mb-1.5">Two lines to add it</h2>
          <p className="text-sm text-[#64748B] mb-6 max-w-lg">
            Wrap your wallet client. Every <code className="text-[13px] text-sky-400/80 bg-white/[0.04] px-1.5 py-0.5 rounded">sendTransaction</code> is checked first.
          </p>

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

`}<span className="c">{`// batch payouts: preview off-chain, settle through PreflightPayout`}</span>{`
`}<span className="k">const</span>{` plan = `}<span className="k">await</span>{` planPayout(payer, [{ to, amount }, …], publicClient)
`}<span className="k">await</span>{` wallet.sendTransaction(plan.tx)   `}<span className="c">{`// blocked payees are skipped, not reverted`}</span>{`

`}<span className="c">{`# or from a shell, no code at all`}</span>{`
npx arc-preflight 0xd882cFc20F52f2599D84b8e8D58C7FB62cfE344b`}</pre>
        </section>

      </main>
    </div>
  )
}
