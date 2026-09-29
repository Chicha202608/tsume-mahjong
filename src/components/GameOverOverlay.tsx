import { Trophy, RefreshCw } from 'lucide-react';

export default function GameOverOverlay({ title, message, onRestart, onOk, isWin }: { title: string; message: string; onRestart: () => void; onOk: () => void; isWin?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className={`border rounded-2xl p-8 flex flex-col items-center gap-4 shadow-2xl ${isWin ? 'bg-[#2a2a1a] border-yellow-500' : 'bg-[#1a2e1a] border-green-700'}`}>
        {isWin && <Trophy size={48} className="text-yellow-400" />}
        <h2 className={`text-3xl font-black ${isWin ? 'text-yellow-300' : 'text-white'}`}>{title}</h2>
        <p className={`text-base ${isWin ? 'text-yellow-200' : 'text-green-400'}`}>{message}</p>
        <div className="flex gap-3 mt-2">
          <button
            onClick={onOk}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gray-600 hover:bg-gray-500 text-white font-bold text-lg transition-colors"
          >
            OK
          </button>
          <button
            onClick={onRestart}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-green-700 hover:bg-green-600 text-white font-bold text-lg transition-colors"
          >
            <RefreshCw size={18} />
            もう一局
          </button>
        </div>
      </div>
    </div>
  );
}
