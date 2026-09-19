import { PreflightDemo } from '@/components/PreflightDemo'

export default function Home() {
  return (
    <main className="min-h-screen" style={{ background: '#0A0B0F', color: '#F1F5F9' }}>
      {/* ─── Header ─── */}
      <header className="glass sticky top-0 z-50" style={{ borderTop: 'none', borderLeft: 'none', borderRight: 'none' }}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Shield Icon */}
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #6366F1, #818CF8)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <span className="font-semibold text-lg tracking-tight" style={{ color: '#F1F5F9' }}>
              arc-preflight
            </span>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: 'rgba(99,102,241,0.15)', color: '#818CF8' }}>
              v0.1.0
            </span>
          </div>
          <div className="flex items-center gap-6">
            <a href="https://www.npmjs.com/package/arc-preflight" target="_blank" rel="noreferrer" className="link-subtle text-sm font-medium">
              npm
            </a>
            <a href="https://github.com/tusharsinghchouhan/arc-preflight" target="_blank" rel="noreferrer" className="link-subtle text-sm font-medium">
              GitHub
            </a>
          </div>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <section className="dot-grid relative overflow-hidden">
        {/* Radial glow behind hero text */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full" style={{ background: 'radial-gradient(ellipse, rgba(99,102,241,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div className="relative max-w-4xl mx-auto px-6 pt-28 pb-20 text-center">
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
            Stop paying gas for{' '}
            <span className="gradient-text">blocked transfers</span>.
          </h1>
          <p className="text-lg max-w-2xl mx-auto leading-relaxed mb-12" style={{ color: '#94A3B8' }}>
            The <code className="text-sm px-2 py-1 rounded-md font-mono" style={{ background: 'rgba(255,255,255,0.06)', color: '#818CF8' }}>arc-preflight</code> SDK simulates USDC transfers on Arc via <code className="text-sm px-1 py-0.5 rounded font-mono" style={{ background: 'rgba(255,255,255,0.06)', color: '#94A3B8' }}>eth_call</code> before submission — catching blocklisted addresses before you spend a single wei.
          </p>

          {/* Stats strip */}
          <div className="flex items-center justify-center gap-12 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold font-mono" style={{ color: '#6366F1' }}>{'<'}1ms</div>
              <div className="text-xs font-medium mt-1" style={{ color: '#64748B' }}>Preflight latency</div>
            </div>
            <div className="w-px h-10" style={{ background: 'rgba(255,255,255,0.08)' }} />
            <div className="text-center">
              <div className="text-2xl font-bold font-mono" style={{ color: '#22C55E' }}>0 gas</div>
              <div className="text-xs font-medium mt-1" style={{ color: '#64748B' }}>On blocked transfers</div>
            </div>
            <div className="w-px h-10" style={{ background: 'rgba(255,255,255,0.08)' }} />
            <div className="text-center">
              <div className="text-2xl font-bold font-mono" style={{ color: '#F1F5F9' }}>2 LOC</div>
              <div className="text-xs font-medium mt-1" style={{ color: '#64748B' }}>To integrate</div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <h2 className="text-sm font-semibold tracking-widest uppercase text-center mb-12" style={{ color: '#64748B', letterSpacing: '0.15em' }}>
          How It Works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { step: '01', title: 'Wrap your client', desc: 'Call withPreflight() on your Viem wallet — one line, zero config.', icon: '⚡' },
            { step: '02', title: 'Auto-simulate', desc: 'Every sendTransaction runs an eth_call against Arc\'s runtime blocklist.', icon: '🔍' },
            { step: '03', title: 'Block or proceed', desc: 'Blocked? PreflightError thrown — no gas spent. Safe? Transaction forwards.', icon: '🛡️' },
          ].map((item) => (
            <div key={item.step} className="feature-card p-6 relative">
              <div className="text-xs font-mono font-bold mb-4" style={{ color: '#6366F1' }}>
                {item.step}
              </div>
              <div className="text-2xl mb-3">{item.icon}</div>
              <h3 className="text-base font-semibold mb-2" style={{ color: '#F1F5F9' }}>{item.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: '#64748B' }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Live Demo ─── */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <h2 className="text-sm font-semibold tracking-widest uppercase text-center mb-2" style={{ color: '#64748B', letterSpacing: '0.15em' }}>
          Live Demo
        </h2>
        <p className="text-center text-sm mb-10" style={{ color: '#475569' }}>
          Connect your wallet to Arc and test a transfer simulation in real-time.
        </p>
        <PreflightDemo />
      </section>

      {/* ─── Features ─── */}
      <section className="max-w-4xl mx-auto px-6 pb-24">
        <h2 className="text-sm font-semibold tracking-widest uppercase text-center mb-12" style={{ color: '#64748B', letterSpacing: '0.15em' }}>
          Capabilities
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { title: 'eth_call Probe', desc: 'Simulate Arc\'s runtime transfer-check rule without submitting a transaction.', badge: 'Core' },
            { title: 'Sanctions Baseline', desc: 'Embedded OFAC SDN, EU & UN snapshots — works fully offline, updated via GitHub Actions.', badge: 'Data' },
            { title: 'Agent Middleware', desc: 'withPreflight() wraps any wallet client — autonomous agents skip blocked addresses automatically.', badge: 'DX' },
          ].map((item) => (
            <div key={item.title} className="feature-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded" style={{ background: 'rgba(99,102,241,0.12)', color: '#818CF8' }}>
                  {item.badge}
                </span>
              </div>
              <h3 className="text-base font-semibold mb-2" style={{ color: '#F1F5F9' }}>{item.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: '#64748B' }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-6xl mx-auto px-6 py-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.2)' }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <span className="text-xs font-medium" style={{ color: '#475569' }}>arc-preflight</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="https://www.npmjs.com/package/arc-preflight" target="_blank" rel="noreferrer" className="text-xs link-subtle">npm</a>
            <a href="https://github.com/tusharsinghchouhan/arc-preflight" target="_blank" rel="noreferrer" className="text-xs link-subtle">GitHub</a>
            <span className="text-xs" style={{ color: '#334155' }}>MIT License</span>
          </div>
        </div>
      </footer>
    </main>
  )
}
