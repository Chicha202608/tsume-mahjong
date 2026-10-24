import { RefreshCw } from 'lucide-react';
import DebugButtons from '@/components/DebugButtons';
import type { TestMode } from '@/game/testScenarios';
import type { GameMode } from '@/game/gameState';
import type { ReactNode } from 'react';

interface Props {
  onHome: () => void;
  mode: GameMode | 'solo-four';
  onMode?: (mode: GameMode) => void;
  onAI?: () => void;
  modeDetails?: ReactNode;
  rightDetails?: ReactNode;
  turnCount: number;
  maxDraws: number;
  wallCount: number;
  isViewingPast: boolean;
  historyIndex: number;
  historyLength: number;
  onRestart: () => void;
  onSetupTest?: (mode: TestMode) => void;
}

export default function Header({ onHome, mode, onMode, onAI, modeDetails, rightDetails, turnCount, maxDraws, wallCount, isViewingPast, historyIndex, historyLength, onRestart, onSetupTest }: Props) {
  if (mode === 'three' || mode === 'four' || mode === 'solo-four') return <header className="contents">
    <nav aria-label="対局メニュー" className="absolute left-2 top-3 bottom-3 w-[148px] rounded-xl border border-emerald-900 bg-[#0f1f0f] p-3 flex flex-col gap-5 text-white">
      <h1 className="font-bold text-xl text-center py-2">詰め麻雀</h1>
      <button onClick={onHome} className="h-11 rounded-lg border border-emerald-700 text-sm hover:bg-emerald-900">トップへ</button>
      <div aria-label="対局モード" className="flex flex-col gap-2">
        {mode === 'solo-four' && <span className="rounded-lg bg-amber-500 py-3 text-center text-sm font-bold text-black">一人四人麻雀</span>}
        {onMode && (['two', 'three', 'four'] as const).map(value => <button key={value} aria-pressed={mode === value}
          onClick={() => onMode(value)} className={`h-11 rounded-lg text-sm ${mode === value ? 'bg-amber-500 text-black font-bold' : 'border border-emerald-700 text-emerald-100 hover:bg-emerald-900'}`}>
          {value === 'two' ? '二人' : value === 'three' ? '三人' : '四人'}
        </button>)}
      </div>
      {modeDetails}
      {(isViewingPast || mode === 'solo-four') && <p className="mt-auto text-center text-sm text-amber-300">牌譜 {historyIndex + 1}/{historyLength}</p>}
    </nav>
    <nav aria-label="検討メニュー" className="absolute right-2 top-3 bottom-3 w-[148px] rounded-xl border border-emerald-900 bg-[#0f1f0f] p-3 flex flex-col gap-3 text-white">
      {onAI && <button onClick={onAI} className="h-11 rounded-lg border border-emerald-700 hover:bg-emerald-900">AI</button>}
      <button onClick={onRestart} className="h-11 flex items-center justify-center gap-2 rounded-lg bg-green-700 hover:bg-green-600"><RefreshCw size={16} />新局</button>
      {rightDetails}
      {onSetupTest && <div className="mt-auto pt-4 border-t border-emerald-900"><DebugButtons vertical onSetupTest={onSetupTest} /></div>}
    </nav>
  </header>;
  return (
    <header className="flex items-center justify-between px-6 py-3 bg-[#0f1f0f] border-b border-[#2d4a2d]">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-green-700 flex items-center justify-center">
          <span className="text-white font-black text-sm">麻</span>
        </div>
        <h1 className="text-white font-bold text-xl tracking-wide">詰め麻雀</h1>
        <button onClick={onHome} className="px-3 py-1.5 rounded-lg border border-emerald-700 text-emerald-100 text-sm hover:bg-emerald-900">トップへ</button>
        <div aria-label="対局モード" className="flex rounded-lg border border-emerald-700 overflow-hidden">
          {onMode && (['two', 'three', 'four'] as const).map(value => <button key={value} aria-pressed={mode === value}
            onClick={() => onMode(value)} className={`px-5 py-1.5 text-sm ${mode === value ? 'bg-amber-500 text-black font-bold' : 'text-emerald-100 hover:bg-emerald-900'}`}>
            {value === 'two' ? '二人' : value === 'three' ? '三人' : '四人'}
          </button>)}
        </div>
        {onAI && <button onClick={onAI} className="px-4 py-1.5 rounded-lg border border-emerald-700 text-white text-sm hover:bg-emerald-900">AI</button>}
        {onSetupTest && <DebugButtons onSetupTest={onSetupTest} />}
      </div>
      <div className="flex items-center gap-3 text-sm text-green-300">
        {isViewingPast && (
          <span className="text-amber-400 text-xs font-semibold">
            牌譜 {historyIndex + 1}/{historyLength}
          </span>
        )}
        {mode === 'two' && <><span>巡目 <span className="text-white font-bold">{turnCount}</span>/{maxDraws}</span>
        <span>山 <span className="text-white font-bold">{wallCount}</span>枚</span></>}
        <button
          onClick={onRestart}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-green-700 hover:bg-green-600 text-white text-sm font-medium transition-colors"
        >
          <RefreshCw size={14} />
          新局
        </button>
      </div>
    </header>
  );
}
