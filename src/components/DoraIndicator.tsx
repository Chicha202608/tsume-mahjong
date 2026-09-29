import { Tile } from '@/types';
import { NakiOption } from '@/gameLogic';
import { Phase } from '@/types';
import TileCard from '@/components/TileCard';
import MiniTile from '@/components/MiniTile';

interface Props {
  wanpai: Tile[];
  doraCount: number;
  ankanOptions: NakiOption[];
  kakanOptions: NakiOption[];
  phase: Phase;
  isViewingPast: boolean;
  onDeclareKan: (option: NakiOption) => void;
}

export default function DoraIndicator({ wanpai, doraCount, ankanOptions, kakanOptions, phase, isViewingPast, onDeclareKan }: Props) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-[#0a1a0a] border-b border-[#2d4a2d]">
      <span className="text-red-400 text-xs font-bold tracking-wider">ドラ表示</span>
      <div className="flex gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => {
          const isRevealed = i < doraCount;
          return (
            <TileCard
              key={i}
              tile={wanpai[4 + i] ?? { id: `dummy-${i}`, suit: 'man', value: 1 }}
              size="sm"
              faceDown={!isRevealed}
            />
          );
        })}
      </div>
      {((ankanOptions.length > 0 || kakanOptions.length > 0) && phase === 'playerDiscard' && !isViewingPast) && (
        <div className="flex items-center gap-2 ml-4">
          {(ankanOptions.length > 0 || kakanOptions.length > 0) && (
            <span className="text-blue-400 text-xs font-semibold">カン可能:</span>
          )}
          {ankanOptions.map((opt, idx) => (
            <button
              key={`ankan-${idx}`}
              onClick={() => onDeclareKan(opt)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-600 active:scale-95 text-white font-bold text-xs transition-all shadow-md"
            >
              <span>暗カン</span>
              <span className="flex gap-0.5 ml-1 bg-[#f8f4e8] rounded p-0.5">
                {opt.tiles.map(t => (
                  <MiniTile key={t.id} tile={t} />
                ))}
              </span>
            </button>
          ))}
          {kakanOptions.map((opt, idx) => (
            <button
              key={`kakan-${idx}`}
              onClick={() => onDeclareKan(opt)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-bold text-xs transition-all shadow-md"
            >
              <span>加槓</span>
              <span className="flex gap-0.5 ml-1 bg-[#f8f4e8] rounded p-0.5">
                <MiniTile key={opt.tiles[0].id} tile={opt.tiles[0]} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
