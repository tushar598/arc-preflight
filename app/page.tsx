import { PreflightDemo } from '@/components/PreflightDemo'

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-24">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-slate-900 rounded flex items-center justify-center">
              <span className="text-white font-bold text-lg">A</span>
            </div>
            <span className="font-semibold text-lg tracking-tight">arc-preflight</span>
          </div>
          <a href="https://github.com/tusharsinghchouhan/arc-preflight" target="_blank" rel="noreferrer" className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors">
            GitHub
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-20 pb-12 px-6 text-center max-w-3xl mx-auto">
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 mb-6">
          Stop paying gas for <span className="text-blue-600">blocklisted transfers</span>.
        </h1>
        <p className="text-lg text-slate-600 mb-8 leading-relaxed">
          The <code className="bg-slate-200 px-2 py-1 rounded text-sm text-slate-800">arc-preflight</code> SDK intercepts NATIVE USDC transfers to OFAC-sanctioned or Arc-blocklisted addresses before they hit the network, saving you gas and preventing stuck transactions.
        </p>
      </section>

      {/* Interactive Demo */}
      <section className="px-6">
        <PreflightDemo />
      </section>
    </main>
  )
}
