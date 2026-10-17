import { ArrowRight, Users } from 'lucide-react';
import type { GameMode } from '@/game/gameState';

export default function ModeSelect({ onSelect }: { onSelect: (mode: GameMode) => void }) {
  return (
    <main className="min-h-dvh flex items-center justify-center bg-[#0f1f0f] px-6 py-12 text-white">
      <div className="w-full max-w-2xl">
        <header className="mb-12 text-center">
          <div aria-hidden="true" className="mx-auto mb-6 flex h-20 w-16 items-center justify-center rounded-xl border-b-4 border-emerald-700 bg-[#faf8ef] text-4xl font-bold text-emerald-900 shadow-lg">麻</div>
          <h1 className="text-5xl font-bold tracking-widest sm:text-6xl">詰め麻雀</h1>
          <p className="mt-6 text-emerald-200">遊ぶモードを選んでください</p>
        </header>
        <div className="grid gap-5 sm:grid-cols-2">
          {(['two', 'four'] as const).map(mode => (
            <button key={mode} onClick={() => onSelect(mode)} className="group rounded-2xl border border-emerald-700 bg-[#1a2e1a] p-7 text-left transition-colors hover:border-amber-400 hover:bg-[#243e24] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-400">
              <Users aria-hidden="true" className="mb-6 text-amber-400" size={28} />
              <span className="block text-2xl font-bold">{mode === 'two' ? '二人モード' : '四人モード'}</span>
              <span className="mt-3 block text-sm text-emerald-200">{mode === 'two' ? '自分とCPU一人で対局' : '自分とCPU三人で対局'}</span>
              <span className="mt-8 flex items-center gap-2 text-sm text-amber-300">はじめる <ArrowRight aria-hidden="true" size={17} /></span>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
