import { replayChoiceStyle } from '@/components/replayChoiceStyle';
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
  readOnly?: boolean;
  replayChoice?: 'pass' | 'ron';
  compact?: boolean;
  largeChoices?: boolean;
  uniformReplayButtons?: boolean;
}

export default function NakiRonButtons({ phase, lastCpuDiscard, ronAvailable, nakiOptions, onRon, onNaki, onDeclareKan, onPassNaki, readOnly = false, replayChoice, compact = false, largeChoices = false, uniformReplayButtons = false }: Props) {
  if (phase !== 'naki' || !lastCpuDiscard) return null;
  return (
    <div className={`px-4 py-3 bg-[#1e3a1e] border-b border-[#2d4a2d] flex items-center justify-center gap-3 flex-wrap ${largeChoices ? '!gap-2 !px-2 !py-0 !flex-nowrap [&_button]:h-[52px] [&_button]:px-3 [&_button]:py-1 [&_button]:text-base [&_svg]:hidden [&_[data-tile-card]]:w-7' : ''} ${uniformReplayButtons ? '[&_svg]:hidden' : ''} ${compact ? '!gap-2 !px-2 !py-2 [&_button]:px-2 [&_button]:py-1 [&_button]:text-sm [&_svg]:hidden [&_[data-tile-card]]:w-5' : ''}`}>
      {ronAvailable && (
        <button
          disabled={readOnly}
          onClick={onRon}
          className={`${uniformReplayButtons ? replayChoiceStyle : 'flex items-center gap-2 px-6 py-2.5 rounded-lg text-base font-bold'} bg-red-600 enabled:hover:bg-red-500 enabled:active:scale-95 text-white transition-all shadow-lg ${readOnly ? 'cursor-default' : 'animate-pulse'} ${replayChoice === 'ron' ? 'ring-4 ring-yellow-400' : ''}`}
        >
          <Trophy size={18} />
          ロン
        </button>
      )}
      {nakiOptions.map((opt, idx) => (
        <button
          key={idx}
          disabled={readOnly}
          onClick={() => (opt.type === 'daiminkan' || opt.type === 'kan') ? onDeclareKan(opt) : onNaki(opt)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg ${(opt.type === 'daiminkan' || opt.type === 'kan') ? 'bg-purple-600 enabled:hover:bg-purple-500' : 'bg-blue-600 enabled:hover:bg-blue-500'} enabled:active:scale-95 text-white font-bold text-sm transition-all shadow-lg ${readOnly ? 'cursor-default' : ''}`}
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
        disabled={readOnly}
        onClick={onPassNaki}
        className={`${uniformReplayButtons ? replayChoiceStyle : 'flex items-center gap-2 px-5 py-2.5 rounded-lg text-base font-bold'} bg-gray-600 enabled:hover:bg-gray-500 enabled:active:scale-95 text-white transition-all shadow-lg ${readOnly ? 'cursor-default' : ''} ${replayChoice === 'pass' ? 'ring-4 ring-yellow-400' : ''}`}
      >
        <X size={18} />
        キャンセル
      </button>
    </div>
  );
}
