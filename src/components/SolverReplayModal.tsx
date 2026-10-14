import { useMemo, useState } from 'react';
import type { State } from '@/game/gameState';
import type { SolverResult } from '@/game/solver';
import { buildSolverReplay, buildNotenReplay } from '@/game/solverReplay';
import TileCard from '@/components/TileCard';
import { getDoraTileKeys } from '@/gameLogic';

interface Props {
  initial: State;
  result: SolverResult;
  onClose: () => void;
}
const actionLabel: Record<string,string> = {
  draw: 'ツモ', 'cpu-turn': 'CPUツモ切り', discard: '打牌',
  'pass-tsumo': 'ツモ見送り', 'pass-naki': '鳴き・ロン見送り',
  ron: 'ロン', tsumo: 'ツモ和了',
};
export default function SolverReplayModal({ initial, result, onClose }: Props) {
  const frames = useMemo(() =>
    result.outcome === 'noten' ? buildNotenReplay(initial) : buildSolverReplay(initial, result),
    [initial, result],
  );
  const [index, setIndex] = useState(0);
  const frame = frames[Math.min(index, frames.length - 1)];
  if (!frame) return null;
  const { state, action } = frame;
  const dora = getDoraTileKeys(state.wanpai, state.doraCount);
  const isDora = (tile: typeof state.playerHand[number]) => dora.has(`${tile.suit}-${tile.value}`);
  const nextDiscard = result.outcome !== 'noten' ? frames[index + 1]?.action : null;
  const isRiichiStep = action?.type === 'discard' && action.riichi;
  const highlightedId = nextDiscard?.type === 'discard' ? nextDiscard.tile.id : null;
  const resultText = result.outcome === 'win' ? `探索得点 ${result.bestScore?.toLocaleString()}点`
    : result.outcome === 'tenpai' ? 'テンパイ' : 'ノーテン（ツモ切り例）';

  return (
    <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-3">
      <div className="bg-[#1a2e1a] border border-green-700 rounded-2xl shadow-2xl w-full max-w-[1120px] max-h-[95%] overflow-y-auto text-white p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold text-xl">探索手順 — {resultText}</h2>
          <button onClick={onClose} className="rounded-lg bg-gray-600 hover:bg-gray-500 px-4 py-2 font-bold">閉じる</button>
        </div>
        <p className="text-green-200 text-sm">手順 {index} / {frames.length - 1}　{action ? actionLabel[action.type] : '配牌'}{action?.type === 'discard' && action.riichi ? '【ここでリーチ宣言】' : ''}</p>
        {isRiichiStep && <p className="text-center text-xl font-black text-yellow-300 bg-yellow-900/40 rounded-lg py-2">リーチ宣言！</p>}
        <div className="bg-[#152615] border border-[#2d4a2d] rounded-lg p-3">
          <div className="text-green-400 text-sm mb-2">CPUの捨て牌</div>
          <div className="flex flex-wrap gap-1 min-h-9">
            {state.cpuDiscards.map((tile) => <TileCard key={tile.id} tile={tile} size="xs" />)}
          </div>
        </div>
        <div className="bg-[#172917] border border-[#2d4a2d] rounded-lg p-3">
          <div className="text-green-400 text-sm mb-2">自分の捨て牌</div>
          <div className="flex flex-wrap gap-1 min-h-9">
            {state.playerDiscards.map(tile => <TileCard key={tile.id} tile={tile} size="xs" dora={isDora(tile)} />)}
          </div>
        </div>
        <div className="bg-[#152615] rounded-lg p-3">
          <div className="text-green-400 text-sm mb-2">手牌　{highlightedId ? '（黄色枠が次に切る牌）' : ''}</div>
          <div className="flex flex-wrap items-end justify-center gap-1">
            {state.playerHand.map(tile => <div key={tile.id} className={highlightedId === tile.id ? 'ring-4 ring-yellow-400 rounded' : ''}><TileCard tile={tile} size="md" dora={isDora(tile)} /></div>)}
            {state.playerDrawnTile && <div className={`ml-2 ${highlightedId === state.playerDrawnTile.id ? 'ring-4 ring-yellow-400 rounded' : ''}`}><TileCard tile={state.playerDrawnTile} size="md" dora={isDora(state.playerDrawnTile)} /></div>}
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <button className="bg-gray-700 rounded-lg px-4 py-2 disabled:opacity-30" disabled={index === 0} onClick={() => setIndex(0)}>最初へ</button>
          <button className="bg-gray-700 rounded-lg px-4 py-2 disabled:opacity-30" disabled={index === 0} onClick={() => setIndex(v => v-1)}>◀ 戻る</button>
          <button className="bg-green-700 rounded-lg px-4 py-2 disabled:opacity-30" disabled={index === frames.length - 1} onClick={() => setIndex(v => v+1)}>進む ▶</button>
          <button className="bg-green-700 rounded-lg px-4 py-2 disabled:opacity-30" disabled={index === frames.length - 1} onClick={() => setIndex(frames.length-1)}>最後へ</button>
        </div>
        {index === frames.length - 1 && <p className="text-center text-yellow-200 font-bold">{resultText}</p>}
      </div>
    </div>
  );
}
