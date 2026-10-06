import { Tile, Phase } from '@/types';
import TileCard from '@/components/TileCard';
import { Trophy, X, Layers, Zap } from 'lucide-react';
import HistoryControls from '@/components/HistoryControls';

interface Props {
  playerHand: Tile[];
  playerDrawnTile: Tile | null;
  phase: Phase;
  isViewingPast: boolean;
  canTsumo: boolean;
  canRiichi: boolean;
  riichiValidTiles: Set<string>;
  isDora: (t: Tile) => boolean;
  onDiscard: (tile: Tile) => void;
  onNakiDiscard: (tile: Tile) => void;
  onRiichiDiscard: (tile: Tile) => void;
  onDeclareTsumo: () => void;
  onPassTsumo: () => void;
  onDeclareRiichi: () => void;
  onShowWall: () => void;
  canUndo: boolean;
  canStepForward: boolean;
  onMatta: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
}

export default function HandSection({
  playerHand, playerDrawnTile, phase, isViewingPast,
  canTsumo, canRiichi, riichiValidTiles, isDora,
  onDiscard, onNakiDiscard, onRiichiDiscard,
  onDeclareTsumo, onPassTsumo, onDeclareRiichi, onShowWall,
  canUndo, canStepForward, onMatta, onStepBack, onStepForward,
}: Props) {
  return (
    <section className="shrink-0 h-[22vh] min-h-[140px] max-h-[190px] flex flex-col items-center justify-center px-4 py-4">
      <div className="relative h-10 w-full overflow-x-auto"><div className="absolute left-1/2 -translate-x-1/2 top-0 h-10 flex items-center gap-3 flex-nowrap">
        <h2 className="text-green-400 text-sm font-semibold tracking-widest uppercase">
          手牌
        </h2>
        <HistoryControls
          canUndo={canUndo}
          canStepForward={canStepForward}
          onMatta={onMatta}
          onStepBack={onStepBack}
          onStepForward={onStepForward}
        />
        <button
          onClick={onShowWall}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-600 active:scale-95 text-white font-bold text-sm transition-all shadow-md"
        >
          <Layers size={14} />
          山
        </button>
        <div className="w-[76px] shrink-0">{canTsumo && (
          <button
            onClick={onDeclareTsumo}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-yellow-500 hover:bg-yellow-400 active:scale-95 text-yellow-900 font-bold text-sm transition-all shadow-md animate-pulse"
          >
            <Trophy size={14} />
            ツモ
          </button>
        )}
        </div></div>
        <div className="w-[110px] shrink-0">{canTsumo && (
          <button
            onClick={onPassTsumo}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gray-600 hover:bg-gray-500 active:scale-95 text-white font-bold text-sm transition-all shadow-md"
          >
            <X size={14} />
            キャンセル
          </button>
        )}


      <div className="flex flex-nowrap justify-center items-end gap-0.5 sm:gap-1 w-full max-w-full overflow-hidden px-2">
        {playerHand.map(tile => {
          const isRiichiInvalid = phase === 'riichiSelect' && !riichiValidTiles.has(tile.id);
          return (
            <div key={tile.id} className="flex-1 min-w-0 max-w-[56px] flex justify-center aspect-[3/4]">
              <TileCard
                tile={tile}
                size="lg"
                dora={isDora(tile)}
                className={`w-full h-full object-contain ${isRiichiInvalid ? 'opacity-30 grayscale pointer-events-none' : ''}`}
                onClick={
                  phase === 'playerDiscard' ? () => onDiscard(tile) :
                  phase === 'playerNakiDiscard' ? () => onNakiDiscard(tile) :
                  phase === 'riichiSelect' && !isRiichiInvalid ? () => onRiichiDiscard(tile) :
                  undefined
                }
              />
            </div>
          );
        })}
        {playerDrawnTile && (
          <div className="ml-2 sm:ml-4 flex-1 min-w-0 max-w-[56px] flex justify-center aspect-[3/4] shrink-0">
            <TileCard
              tile={playerDrawnTile}
              size="lg"
              dora={isDora(playerDrawnTile)}
              className={`w-full h-full object-contain ${phase === 'riichiSelect' && !riichiValidTiles.has(playerDrawnTile.id) ? 'opacity-30 grayscale pointer-events-none' : ''}`}
              onClick={
                phase === 'playerDiscard' ? () => onDiscard(playerDrawnTile) :
                phase === 'playerNakiDiscard' ? () => onNakiDiscard(playerDrawnTile) :
                phase === 'riichiSelect' && riichiValidTiles.has(playerDrawnTile.id) ? () => onRiichiDiscard(playerDrawnTile) :
                undefined
              }
            />
          </div>
        )}
      </div>
    </section>
  );
}
