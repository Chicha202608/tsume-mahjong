import { useMemo, useState } from 'react';
import type { State } from '@/game/gameState';
import type { SolverResult } from '@/game/solver';
import { buildSolverReplay, buildNotenReplay } from '@/game/solverReplay';
import TileCard from '@/components/TileCard';
import { getDoraTileKeys } from '@/gameLogic';
import { isStopState } from '@/game/history';
import { scoreHand } from '@/game/scoreAdapter';
import YakuDisplay from '@/components/YakuDisplay';
import NakiRonButtons from '@/components/NakiRonButtons';

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
  // Navigate only through states where the player has a choice, like the main history.
  const stops = useMemo(() => frames.map((frame, i) => i)
    .filter(i => i === 0 || i === frames.length - 1 || isStopState(frames[i].state)), [frames]);
  const [stopPosition, setStopPosition] = useState(0);
  const [scoreDismissed, setScoreDismissed] = useState(false);
  const index = stops[Math.min(stopPosition, stops.length - 1)] ?? 0;
  const frame = frames[Math.min(index, frames.length - 1)];
  const scoreResult = useMemo(() => {
    if (frame?.state.phase !== 'win') return null;
    try {
      return scoreHand(frame.state);
    } catch {
      return null;
    }
  }, [frame]);
  const navigate = (position: number) => {
    setStopPosition(position);
    setScoreDismissed(false);
  };
  if (!frame) return null;
  const { state, action } = frame;
  const dora = getDoraTileKeys(state.wanpai, state.doraCount);
  const isDora = (tile: typeof state.playerHand[number]) => dora.has(`${tile.suit}-${tile.value}`);
  const followingStop = stops[stopPosition + 1] ?? index;
  const nextAction = frames[index + 1]?.action;
  const replayChoice = nextAction?.type === 'pass-naki' ? 'pass'
    : nextAction?.type === 'ron' ? 'ron' : undefined;
  const nextDiscard = result.outcome !== 'noten'
    ? frames.slice(index + 1, followingStop + 1).map(frame => frame.action)
      .find(action => action?.type === 'discard') ?? null : null;
  // A riichi announcement precedes the declaration discard, not follows it.
  const isRiichiStep = nextDiscard?.type === 'discard' && !!nextDiscard.riichi;
  const highlightedId = nextDiscard?.type === 'discard' ? nextDiscard.tile.id : null;
  const resultText = result.outcome === 'win' ? `AIの得点 ${result.bestScore?.toLocaleString()}点`
    : result.outcome === 'tenpai' ? 'テンパイ' : 'ノーテン（ツモ切り例）';

  return (
    <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-3">
      <div className="bg-[#1a2e1a] border border-green-700 rounded-2xl shadow-2xl w-full max-w-[1120px] h-[min(92dvh,760px)] overflow-hidden text-white p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold text-xl">AIの手順 — {resultText}</h2>
          <button onClick={onClose} className="rounded-lg bg-gray-600 hover:bg-gray-500 px-4 py-2 font-bold">閉じる</button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3">
        <p className="text-green-200 text-sm">手順 {stopPosition + 1} / {stops.length}　{action ? actionLabel[action.type] : '配牌'}</p>
        <div className="h-10 shrink-0 flex items-center justify-center">{isRiichiStep && <span className="text-center text-xl font-black text-yellow-300 bg-yellow-900/40 rounded-lg py-1 px-6">リーチ</span>}</div>
        <div className="h-[86px] shrink-0 overflow-hidden bg-[#152615] border border-[#2d4a2d] rounded-lg p-3">
          <div className="text-green-400 text-sm mb-2">CPUの捨て牌</div>
          <div className="flex flex-wrap gap-1 min-h-9">
            {state.cpuDiscards.map((tile) => <TileCard key={tile.id} tile={tile} size="xs" />)}
          </div>
        </div>
        <div className="h-[86px] shrink-0 overflow-hidden bg-[#172917] border border-[#2d4a2d] rounded-lg p-3">
          <div className="text-green-400 text-sm mb-2">自分の捨て牌</div>
          <div className="flex flex-wrap gap-1 min-h-9">
            {state.playerDiscards.map(tile => <TileCard key={tile.id} tile={tile} size="xs" dora={isDora(tile)} />)}
          </div>
        </div>
        <div className="h-20 shrink-0 overflow-y-auto">
        {state.phase === 'naki' && state.lastCpuDiscard && (
          <div className="rounded-lg border border-green-700 overflow-hidden">
            <NakiRonButtons phase={state.phase} lastCpuDiscard={state.lastCpuDiscard}
              ronAvailable={state.ronAvailable} nakiOptions={state.nakiOptions}
              readOnly replayChoice={replayChoice}
              onRon={() => {}} onNaki={() => {}} onDeclareKan={() => {}} onPassNaki={() => {}} />
          </div>
        )}
        </div>
        <div className="flex-1 min-h-[130px] bg-[#152615] rounded-lg p-3">
          <div className="text-green-400 text-sm mb-2">手牌　{highlightedId ? '（黄色枠が次に切る牌）' : ''}</div>
          <div className="flex flex-nowrap items-end justify-start gap-1 mx-auto w-[850px] min-h-[90px]">
            {state.playerHand.map(tile => <div key={tile.id} className={highlightedId === tile.id ? 'ring-4 ring-yellow-400 rounded' : ''}><TileCard tile={tile} size="md" dora={isDora(tile)} /></div>)}
            <div className="ml-2 shrink-0">{state.playerDrawnTile && <div className={highlightedId === state.playerDrawnTile.id ? 'ring-4 ring-yellow-400 rounded' : ''}><TileCard tile={state.playerDrawnTile} size="md" dora={isDora(state.playerDrawnTile)} /></div>}</div>
          </div>
        </div>
        {index === frames.length - 1 && <p className="text-center text-yellow-200 font-bold">{resultText}</p>}
        {state.phase === 'win' && <button onClick={() => setScoreDismissed(false)} className="self-center rounded-lg bg-amber-700 hover:bg-amber-600 px-4 py-2 font-bold">役・点数を表示</button>}
        </div>
        <div className="shrink-0 flex flex-wrap justify-center gap-2 border-t border-green-800 pt-3">
          <button className="bg-gray-700 rounded-lg px-4 py-2 disabled:opacity-30" disabled={stopPosition === 0} onClick={() => navigate(0)}>最初へ</button>
          <button className="bg-gray-700 rounded-lg px-4 py-2 disabled:opacity-30" disabled={stopPosition === 0} onClick={() => navigate(stopPosition - 1)}>◀ 戻る</button>
          <button className="bg-green-700 rounded-lg px-4 py-2 disabled:opacity-30" disabled={stopPosition === stops.length - 1} onClick={() => navigate(stopPosition + 1)}>進む ▶</button>
          <button className="bg-green-700 rounded-lg px-4 py-2 disabled:opacity-30" disabled={stopPosition === stops.length - 1} onClick={() => navigate(stops.length - 1)}>最後へ</button>
        </div>
      </div>
      {state.phase === 'win' && !scoreDismissed && (
        <div role="dialog" aria-modal="true" aria-labelledby="ai-score-title" className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-3">
          <div className="bg-[#2a2a1a] border border-yellow-500 rounded-2xl p-6 flex flex-col items-center gap-5 shadow-2xl max-w-[min(94vw,42rem)] max-h-[88dvh] overflow-y-auto text-white">
            <h2 id="ai-score-title" className="text-2xl font-bold">AIの和了 — {state.winType === 'ron' ? 'ロン' : 'ツモ'}</h2>
            {scoreResult?.valid && scoreResult.handInterpretations.length > 0
              ? <YakuDisplay result={scoreResult} />
              : <p className="text-red-300">AIの和了の採点結果を取得できませんでした。</p>}
            <button autoFocus onClick={() => setScoreDismissed(true)} className="rounded-xl bg-gray-600 hover:bg-gray-500 px-6 py-3 font-bold">手順に戻る</button>
          </div>
        </div>
      )}
    </div>
  );
}
