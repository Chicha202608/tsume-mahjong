import { Tile } from '@/types';
import { Phase } from '@/types';
import { NakiOption } from '@/gameLogic';
import { Trophy, Hand, X } from 'lucide-react';
import MiniTile from '@/components/MiniTile';

interface Props {
  phase: Phase;
  lastCpuDiscard: Tile | null;
  ronAvailable: boolean;
  nakiOptions: NakiOption[];
  onRon: () => void;
  onNaki: (option: NakiOption) => void;
  onDeclareKan: (option: NakiOption) => void;
  onPassNaki: () => void;
}

export default function NakiRonButtons({ phase, lastCpuDiscard, ronAvailable, nakiOptions, onRon, onNaki, onDeclareKan, onPassNaki }: Props) {
  if (phase !== 'naki' || !lastCpuDiscard) return null;
  return (
    <div className="px-4 py-3 bg-[#1e3a1e] border-b border-[#2d4a2d] flex items-center justify-center gap-3 flex-wrap">
      {ronAvailable && (
        <button
          onClick={onRon}
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 active:scale-95 text-white font-bold text-base transition-all shadow-lg animate-pulse"
        >
          <Trophy size={18} />
          ロン
        </button>
      )}
      {nakiOptions.map((opt, idx) => (
        <button
          key={idx}
          onClick={() => (opt.type === 'daiminkan' || opt.type === 'kan') ? onDeclareKan(opt) : onNaki(opt)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg ${(opt.type === 'daiminkan' || opt.type === 'kan') ? 'bg-purple-600 hover:bg-purple-500' : 'bg-blue-600 hover:bg-blue-500'} active:scale-95 text-white font-bold text-sm transition-all shadow-lg`}
        >
          <Hand size={16} />
          <span>{opt.type === 'pung' ? 'ポン' : (opt.type === 'daiminkan' || opt.type === 'kan') ? 'カン' : 'チー'}</span>
          <span className="flex gap-0.5 ml-1 bg-[#f8f4e8] rounded p-0.5">
            {[...opt.tiles, opt.calledTile].sort((a, b) =>
              a.suit === b.suit ? a.value - b.value : 0
            ).map(t => (
              <MiniTile key={t.id} tile={t} />
            ))}
          </span>
        </button>
      ))}
      <button
        onClick={onPassNaki}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gray-600 hover:bg-gray-500 active:scale-95 text-white font-bold text-base transition-all shadow-lg"
      >
        <X size={18} />
        キャンセル
      </button>
    </div>
  );
}
