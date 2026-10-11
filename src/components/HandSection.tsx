import { Tile, Phase, Furo } from '@/types';
import TileCard from '@/components/TileCard';
import PlayerFuro from '@/components/PlayerFuro';
import { Trophy, X, Layers, Zap } from 'lucide-react';
import HistoryControls from '@/components/HistoryControls';

interface Props {
  playerHand: Tile[];
  playerDrawnTile: Tile | null;
  playerFuro: Furo[];
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
  playerHand, playerDrawnTile, playerFuro, phase, isViewingPast,
  canTsumo, canRiichi, riichiValidTiles, isDora,
  onDiscard, onNakiDiscard, onRiichiDiscard,
  onDeclareTsumo, onPassTsumo, onDeclareRiichi, onShowWall,
  canUndo, canStepForward, onMatta, onStepBack, onStepForward,
}: Props) {
  return (
    <section className="shrink-0 flex flex-col items-stretch justify-end px-2 pt-1 pb-6">
      <div className="min-h-[44px] w-full mb-2 relative z-30 bg-[#1a2e1a] flex items-center overflow-x-auto [scrollbar-width:thin]">
        <div className="flex items-center gap-2 flex-nowrap py-1 px-1 flex-1 justify-end">
          <h2 className="text-green-400 text-sm font-semibold tracking-widest uppercase shrink-0">
            手牌
          </h2>
        </div>
        <div className="flex items-center justify-center py-1 px-1 shrink-0">
          <HistoryControls
            canUndo={canUndo}
            canStepForward={canStepForward}
            onMatta={onMatta}
            onStepBack={onStepBack}
            onStepForward={onStepForward}
          />
        </div>
        <div className="flex items-center gap-2 flex-nowrap py-1 px-1 flex-1 justify-start">
          <button
            onClick={onShowWall}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-600 active:scale-95 text-white font-bold text-sm transition-all shadow-md shrink-0 whitespace-nowrap"
          >
            <Layers size={14} />
            山
          </button>
          {canRiichi && (
            <button
              onClick={onDeclareRiichi}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-sm transition-all shadow-md whitespace-nowrap shrink-0"
            >
              <Zap size={14} />
              リーチ
            </button>
          )}
          <div className="w-[76px] shrink-0 flex justify-center">
            {canTsumo && (
              <button
                onClick={onDeclareTsumo}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500 hover:bg-yellow-400 active:scale-95 text-yellow-900 font-bold text-sm transition-all shadow-md animate-pulse whitespace-nowrap"
              >
                <Trophy size={14} />
                ツモ
              </button>
            )}
          </div>
          <div className="w-[110px] shrink-0 flex justify-center">
            {canTsumo && (
              <button
                onClick={onPassTsumo}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-600 hover:bg-gray-500 active:scale-95 text-white font-bold text-sm transition-all shadow-md whitespace-nowrap"
              >
                <X size={14} />
                キャンセル
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="relative w-full">
        <div className="flex flex-nowrap justify-center items-end gap-0.5 sm:gap-1 w-full max-w-full overflow-x-auto [scrollbar-width:thin] px-2">
          {playerHand.map(tile => {
            const isRiichiInvalid = phase === 'riichiSelect' && !riichiValidTiles.has(tile.id);
            return (
              <div key={tile.id} className="w-[53px] shrink-0 flex justify-center aspect-[3/4]">
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
          <div className="ml-2 sm:ml-3 w-[53px] shrink-0 flex justify-center aspect-[3/4]">
            {playerDrawnTile && (
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
            )}
          </div>
        </div>
        {playerFuro.length > 0 && (
          <div className="absolute right-2 bottom-0 z-40">
            <PlayerFuro playerFuro={playerFuro} isDora={isDora} />
          </div>
        )}
      </div>
    </section>
  );
}
