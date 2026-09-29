import { RefreshCw } from 'lucide-react';

interface Props {
  turnCount: number;
  maxDraws: number;
  wallCount: number;
  isViewingPast: boolean;
  historyIndex: number;
  historyLength: number;
  onRestart: () => void;
}

export default function Header({ turnCount, maxDraws, wallCount, isViewingPast, historyIndex, historyLength, onRestart }: Props) {
  return (
    <header className="flex items-center justify-between px-6 py-3 bg-[#0f1f0f] border-b border-[#2d4a2d]">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-green-700 flex items-center justify-center">
          <span className="text-white font-black text-sm">麻</span>
        </div>
        <h1 className="text-white font-bold text-xl tracking-wide">詰め麻雀</h1>
      </div>
      <div className="flex items-center gap-3 text-sm text-green-300">
        {isViewingPast && (
          <span className="text-amber-400 text-xs font-semibold">
            牌譜 {historyIndex + 1}/{historyLength}
          </span>
        )}
        <span>巡目 <span className="text-white font-bold">{turnCount}</span>/{maxDraws}</span>
        <span>山 <span className="text-white font-bold">{wallCount}</span>枚</span>
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
