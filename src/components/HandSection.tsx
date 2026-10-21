import { Tile, Phase, Furo, Wind } from '@/types';
import TileCard from '@/components/TileCard';
import PlayerFuro from '@/components/PlayerFuro';
import { Trophy, X, Layers, Zap } from 'lucide-react';
import HistoryControls from '@/components/HistoryControls';
import TableMelds from '@/components/TableMelds';

interface Props {
  fourPlayer?: boolean;
  publicTiles?: boolean;
  playerWind?: Wind;
  canDiscardTile?: (tile: Tile) => boolean;
  playerHand: Tile[];
  playerDrawnTile: Tile | null;
  playerFuro: Furo[];
  phase: Phase;
  isRiichi: boolean;
  isViewingPast: boolean;
  canTsumo: boolean;
  canRiichi: boolean;
  riichiValidTiles: Set<string>;
  isDora: (t: Tile) => boolean;
  onDiscard: (tile: Tile) => void;
  onNakiDiscard: (tile: Tile) => void;
  onRiichiDiscard: (tile: Tile) => void;
  onDeclareTsumo: () => void;
  onPassTsumo?: () => void;
  onDeclareRiichi: () => void;
  onShowWall: () => void;
  canUndo: boolean;
  canStepBack: boolean;
  canStepForward: boolean;
  onMatta: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onFirst: () => void;
  onLast: () => void;
}

export default function HandSection({
  fourPlayer = false,
  publicTiles = false, playerWind = 'east', canDiscardTile,
  playerHand, playerDrawnTile, playerFuro, phase, isRiichi,
  canTsumo, canRiichi, riichiValidTiles, isDora,
  onDiscard, onNakiDiscard, onRiichiDiscard,
  onDeclareTsumo, onPassTsumo, onDeclareRiichi, onShowWall,
  canUndo, canStepBack, canStepForward, onMatta, onStepBack, onStepForward, onFirst, onLast,
}: Props) {
  return (
    <section className={`shrink-0 flex flex-col items-stretch justify-end px-2 pt-1 ${fourPlayer ? 'pb-16 h-[190px]' : 'pb-6'}`}>
      <div className={`min-h-[44px] w-full mb-2 relative z-30 ${fourPlayer ? '' : 'bg-[#1a2e1a]'} flex items-center overflow-x-auto [scrollbar-width:thin]`}>
        <div className="flex items-center gap-2 flex-nowrap py-1 px-1 flex-1 justify-end">
          <h2 className="text-green-400 text-sm font-semibold tracking-widest uppercase shrink-0">
            手牌
          </h2>
          <button onClick={onShowWall} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-600 text-white font-bold text-sm shrink-0">
            <Layers size={14} />山
          </button>
        </div>
        <div className="flex items-center justify-center py-1 px-1 shrink-0">
          <HistoryControls
            canUndo={canUndo}
            canStepBack={canStepBack}
            canStepForward={canStepForward}
            onMatta={onMatta}
            onStepBack={onStepBack}
            onStepForward={onStepForward}
            onFirst={onFirst}
            onLast={onLast}
          />
        </div>
        <div className="flex items-center gap-2 flex-nowrap py-1 px-1 flex-1 justify-start">
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
            {canTsumo && onPassTsumo && (
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

      <div className={fourPlayer ? "relative w-full flex items-end justify-center gap-6" : "relative w-full"}>
        <div data-player-hand data-hand-wind={publicTiles ? playerWind : undefined} className={`flex flex-nowrap justify-center items-end gap-0.5 sm:gap-1 ${fourPlayer ? 'shrink-0' : 'w-full max-w-full overflow-x-auto [scrollbar-width:thin]'} px-2`}>
          {playerHand.map(tile => {
            const isRiichiInvalid = phase === 'riichiSelect' && !riichiValidTiles.has(tile.id);
            const blocked = canDiscardTile ? !canDiscardTile(tile) : false;
            return (
              <div key={tile.id} className="w-[53px] shrink-0 flex justify-center aspect-[3/4]">
                <TileCard
                  tile={tile}
                  size="lg"
                  dora={isDora(tile)}
                  className={`w-full h-full object-contain ${isRiichiInvalid || (blocked && (phase === 'playerDiscard' || phase === 'playerNakiDiscard')) ? 'opacity-30 grayscale pointer-events-none' : ''}`}
                  onClick={
                    blocked ? undefined :
                    phase === 'playerDiscard' && !isRiichi ? () => onDiscard(tile) :
                    phase === 'playerNakiDiscard' ? () => onNakiDiscard(tile) :
                    phase === 'riichiSelect' && !isRiichiInvalid ? () => onRiichiDiscard(tile) :
                    undefined
                  }
                />
              </div>
            );
          })}
          <div className="ml-1 w-[53px] shrink-0 flex justify-center aspect-[3/4]">
            {playerDrawnTile && (
              <TileCard
                tile={playerDrawnTile}
                size="lg"
                dora={isDora(playerDrawnTile)}
                className={`w-full h-full object-contain ${phase === 'riichiSelect' && !riichiValidTiles.has(playerDrawnTile.id) ? 'opacity-30 grayscale pointer-events-none' : ''}`}
                onClick={
                  canDiscardTile && !canDiscardTile(playerDrawnTile) ? undefined :
                  phase === 'playerDiscard' ? () => onDiscard(playerDrawnTile) :
                  phase === 'playerNakiDiscard' ? () => onNakiDiscard(playerDrawnTile) :
                  phase === 'riichiSelect' && riichiValidTiles.has(playerDrawnTile.id) ? () => onRiichiDiscard(playerDrawnTile) :
                  undefined
                }
              />
            )}
          </div>
        </div>
      {fourPlayer && playerFuro.length > 0 && <div aria-label="副露" data-player-furo className="shrink-0 flex items-end gap-3">
        {publicTiles ? <TableMelds furo={playerFuro} wind={playerWind} isDora={isDora} size="sm" /> : playerFuro.map((furo, i) => <div key={i} className="flex gap-0.5">
          {furo.tiles.map((tile, j) => <TileCard key={tile.id} tile={tile} size="sm" dora={isDora(tile)}
            faceDown={furo.type === 'ankan' && (j === 0 || j === 3)} />)}
        </div>)}
      </div>}
        {playerFuro.length > 0 && !fourPlayer && (
          <div className="absolute right-2 bottom-0 z-40">
            <PlayerFuro playerFuro={playerFuro} isDora={isDora} />
          </div>
        )}
      </div>

    </section>
  );
}
