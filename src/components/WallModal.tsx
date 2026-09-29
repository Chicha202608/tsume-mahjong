import { Tile, Phase } from '@/types';
import TileCard from '@/components/TileCard';
import { X, Layers } from 'lucide-react';

const WANPAI_COUNT = 14;

interface Props {
  wall: Tile[];
  fullWall: Tile[];
  wallDrawnCount: number;
  doraCount: number;
  wanpai: Tile[];
  phase: Phase;
  onClose: () => void;
  turnCount: number;
}

export default function WallModal({ wall, fullWall, wallDrawnCount, doraCount, wanpai, phase, turnCount,onClose }: Props) {
  const supplementCount = Math.max(doraCount - 1, 0);
  const MAX_DRAWS = 18;
  
  const nextDrawIsPlayer = phase === 'playerDraw' || phase === 'naki';
  
  const futurePlayerDrawCount =
    phase === 'playerDiscard' || phase === 'riichiSelect'
      ? Math.max(MAX_DRAWS - turnCount - 1, 0)
      : Math.max(MAX_DRAWS - turnCount, 0);
  
  const isPlayerFutureDraw = (idx: number) => {
    if (idx < wallDrawnCount) return false;
    if (idx >= fullWall.length - supplementCount) return false;
  
    const offset = idx - wallDrawnCount;
    const playerDrawIndex = nextDrawIsPlayer
      ? Math.floor(offset / 2)
      : Math.floor((offset - 1) / 2);
  
    return (
      playerDrawIndex >= 0 &&
      playerDrawIndex < futurePlayerDrawCount
    );
  };
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[#152615] border border-green-700 rounded-2xl p-6 max-w-4xl w-full mx-4 shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold text-lg flex items-center gap-2">
            <Layers size={20} className="text-amber-400" />
            ツモ山 — 残り{wall.length}枚 / 全{fullWall.length}枚
          </h2>
          <button
            onClick={onClose}
            className="text-green-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Live wall */}
        <div className="rounded-lg p-3 bg-[#0e1e0e]">
          {fullWall.length === 0 ? (
            <p className="text-green-700 text-sm text-center py-8">山がありません</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {fullWall.map((tile, idx) => {
                const isDrawn = idx < wallDrawnCount;
                const isSupplement = idx >= fullWall.length - supplementCount;
                const dimmed = isDrawn || isSupplement;
                const isPlayerDraw = isPlayerFutureDraw(idx);
                return (
                  <div key={tile.id} className="flex flex-col items-center gap-1">
                    <span className={`text-[10px] ${dimmed ? 'text-gray-600' : 'text-green-600'}`}>
                      {idx + 1}
                    </span>
                    <TileCard
                      tile={tile}
                      size="sm"
                      className={dimmed ? 'opacity-30 grayscale' : ''}
                      highlighted={isPlayerDraw}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Wanpai section */}
        <div className="mt-4 rounded-lg p-3 bg-[#0e1e0e]">
          <h3 className="text-amber-400 text-sm font-bold mb-3 flex items-center gap-2">
            <Layers size={14} />
            王牌（{WANPAI_COUNT}枚）
          </h3>
          {(() => {
            type WanpaiSlot = { tile: Tile | undefined; label: string; labelColor: string };
            const slots: WanpaiSlot[] = [];

            const wanpaiTiles = wanpai || [];
            const currentKanCount = Math.min(Math.max(doraCount - 1, 0), 4);
            const remainingRinshanCount = 4 - currentKanCount;

            for (let i = 0; i < remainingRinshanCount; i++) {
              slots.push({
                tile: wanpaiTiles[i],
                label: `嶺上牌${i + 1}`,
                labelColor: 'text-blue-400',
              });
            }

            slots.push({ tile: wanpaiTiles[4], label: '表ドラ', labelColor: 'text-red-400 font-bold' });
            slots.push({ tile: wanpaiTiles[9], label: '裏ドラ', labelColor: 'text-purple-400 font-bold' });

            slots.push({ tile: wanpaiTiles[5], label: '槓ドラ1', labelColor: 'text-red-400 font-bold' });
            slots.push({ tile: wanpaiTiles[10], label: '槓裏ドラ1', labelColor: 'text-purple-400 font-bold' });

            slots.push({ tile: wanpaiTiles[6], label: '槓ドラ2', labelColor: 'text-red-400 font-bold' });
            slots.push({ tile: wanpaiTiles[11], label: '槓裏ドラ2', labelColor: 'text-purple-400 font-bold' });

            slots.push({ tile: wanpaiTiles[7], label: '槓ドラ3', labelColor: 'text-red-400 font-bold' });
            slots.push({ tile: wanpaiTiles[12], label: '槓裏ドラ3', labelColor: 'text-purple-400 font-bold' });

            slots.push({ tile: wanpaiTiles[8], label: '槓ドラ4', labelColor: 'text-red-400 font-bold' });
            slots.push({ tile: wanpaiTiles[13], label: '槓裏ドラ4', labelColor: 'text-purple-400 font-bold' });

            for (let i = remainingRinshanCount; i < 4; i++) {
              slots.push({
                tile: wanpaiTiles[i],
                label: '王牌補填',
                labelColor: 'text-slate-500',
              });
            }

            return (
              <div className="flex flex-wrap gap-0">
                {slots.map((slot, i) => (
                  <div key={i} className="flex flex-col items-center gap-0.5">
                    <span className={`text-[8px] ${slot.labelColor} whitespace-nowrap`}>{slot.label}</span>
                    {slot.tile ? (
                      <TileCard tile={slot.tile} size="sm" />
                    ) : (
                      <div className="w-10 h-14 rounded-md border border-[#3a5a3a] bg-[#1a3a1a]" />
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
