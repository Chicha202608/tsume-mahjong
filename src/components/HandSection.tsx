import { Tile, Phase } from '@/types';
import TileCard from '@/components/TileCard';
import { Trophy, X, Layers, Zap } from 'lucide-react';

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
}

export default function HandSection({
  playerHand, playerDrawnTile, phase, isViewingPast,
  canTsumo, canRiichi, riichiValidTiles, isDora,
  onDiscard, onNakiDiscard, onRiichiDiscard,
  onDeclareTsumo, onPassTsumo, onDeclareRiichi, onShowWall,
}: Props) {
  return (
    <section className="shrink-0 h-[22vh] min-h-[140px] max-h-[190px] flex flex-col items-center justify-center px-4 py-4">
      <div className="h-10 w-full flex items-center gap-3 mb-4 flex-nowrap justify-center overflow-x-auto">
        <h2 className="text-green-400 text-sm font-semibold tracking-widest uppercase">
          手牌
        </h2>
        <button
          onClick={onShowWall}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-600 active:scale-95 text-white font-bold text-sm transition-all shadow-md"
        >
          <Layers size={14} />
          山
        </button>
        {canTsumo && (
          <button
            onClick={onDeclareTsumo}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-yellow-500 hover:bg-yellow-400 active:scale-95 text-yellow-900 font-bold text-sm transition-all shadow-md animate-pulse"
          >
            <Trophy size={14} />
            ツモ
          </button>
        )}
        {canTsumo && (
          <button
            onClick={onPassTsumo}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gray-600 hover:bg-gray-500 active:scale-95 text-white font-bold text-sm transition-all shadow-md"
          >
            <X size={14} />
            キャンセル
          </button>
        )}
        {canRiichi && !isViewingPast && (
          <button
            onClick={onDeclareRiichi}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-sm transition-all shadow-md"
          >
            <Zap size={14} />
            リーチ
          </button>
        )}
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
