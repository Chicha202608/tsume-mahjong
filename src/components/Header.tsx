import { RefreshCw, Bug } from 'lucide-react';

interface Props {
  turnCount: number;
  maxDraws: number;
  wallCount: number;
  isViewingPast: boolean;
  historyIndex: number;
  historyLength: number;
  onRestart: () => void;
  onSetupTest: (mode: 'ankan' | 'kakan' | 'daiminkan') => void;
}

export default function Header({ turnCount, maxDraws, wallCount, isViewingPast, historyIndex, historyLength, onRestart, onSetupTest }: Props) {
  return (
    <header className="flex items-center justify-between px-6 py-3 bg-[#0f1f0f] border-b border-[#2d4a2d]">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-green-700 flex items-center justify-center">
          <span className="text-white font-black text-sm">麻</span>
        </div>
        <h1 className="text-white font-bold text-xl tracking-wide">詰め麻雀</h1>
        <div className="flex items-center gap-1.5 ml-2">
          <span className="text-gray-500 text-xs font-semibold flex items-center gap-1">
            <Bug size={12} />
            テスト:
          </span>
          <button
            onClick={() => onSetupTest('ankan')}
            className="px-2 py-0.5 rounded-md bg-gray-800 hover:bg-gray-700 active:scale-95 text-gray-300 text-xs font-medium transition-all"
          >
            暗カン準備
          </button>
          <button
            onClick={() => onSetupTest('kakan')}
            className="px-2 py-0.5 rounded-md bg-gray-800 hover:bg-gray-700 active:scale-95 text-gray-300 text-xs font-medium transition-all"
          >
            加槓準備
          </button>
          <button
            onClick={() => onSetupTest('daiminkan')}
            className="px-2 py-0.5 rounded-md bg-gray-800 hover:bg-gray-700 active:scale-95 text-gray-300 text-xs font-medium transition-all"
          >
            大明槓準備
          </button>
        </div>
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
