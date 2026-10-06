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
    <section className="shrink-0 flex flex-col items-stretch justify-end px-2 pt-1 pb-3">
      <div className="min-h-[44px] w-full mb-2 flex items-center justify-[safe_center] overflow-x-auto [scrollbar-width:thin]">
        <div className="flex items-center gap-2 flex-nowrap py-1 px-1">
          <h2 className="text-green-400 text-sm font-semibold tracking-widest uppercase shrink-0">
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-600 active:scale-95 text-white font-bold text-sm transition-all shadow-md shrink-0 whitespace-nowrap"
          >
            <Layers size={14} />
            山
          </button>
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
          <div className="w-[82px] shrink-0 flex justify-center">
            {canRiichi && !isViewingPast && (
              <button
                onClick={onDeclareRiichi}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-sm transition-all shadow-md whitespace-nowrap"
              >
                <Zap size={14} />
                リーチ
              </button>
            )}
          </div>
          <div className="shrink-0 text-left text-[10px] whitespace-nowrap">
            {phase === 'riichiSelect' && !isViewingPast && (
              <span className="text-blue-400 font-normal normal-case text-xs animate-pulse">
                リーチ — 宣言牌（捨て牌）をクリック
              </span>
            )}
            {phase === 'playerDiscard' && !canTsumo && !isViewingPast && (
              <span className="text-amber-400 font-normal normal-case text-xs animate-pulse">
                捨てる牌をクリック
              </span>
            )}
            {canTsumo && !isViewingPast && (
              <span className="text-yellow-400 font-normal normal-case text-xs animate-pulse">
                ツモ和了可能 — ツモ or キャンセル
              </span>
            )}
            {phase === 'playerNakiDiscard' && !isViewingPast && (
              <span className="text-blue-400 font-normal normal-case text-xs animate-pulse">
                鳴きました — 捨てる牌をクリック
              </span>
            )}
            {isViewingPast && (phase === 'playerDiscard' || phase === 'playerNakiDiscard') && (
              <span className="text-amber-400 font-normal normal-case text-xs">
                牌譜閲覧中 — 牌をクリックで新しく打ち直せます
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-nowrap justify-center items-end gap-0.5 sm:gap-1 w-full max-w-full overflow-x-auto [scrollbar-width:thin] px-2">
        {playerHand.map(tile => {
          const isRiichiInvalid = phase === 'riichiSelect' && !riichiValidTiles.has(tile.id);
          return (
            <div key={tile.id} className="w-[44px] shrink-0 flex justify-center aspect-[3/4]">
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
        <div className="ml-2 sm:ml-3 w-[44px] shrink-0 flex justify-center aspect-[3/4]">
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
    </section>
  );
}
