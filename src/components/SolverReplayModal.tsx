import { replayChoiceStyle } from '@/components/replayChoiceStyle';
import { hasFuturePlayerDraw } from '@/game/seatFlow';
import FourPlayerTable from '@/components/FourPlayerTable';
import { useLayoutEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { State } from '@/game/gameState';
import type { SolverResult } from '@/game/solver';
import { buildSolverReplay, buildNotenReplay } from '@/game/solverReplay';
import TileCard from '@/components/TileCard';
import { getDoraTileKeys, canRiichi } from '@/gameLogic';
import { isStopState } from '@/game/history';
import { scoreHand } from '@/game/scoreAdapter';
import YakuDisplay from '@/components/YakuDisplay';
import NakiRonButtons from '@/components/NakiRonButtons';
import ReplayFit from '@/components/ReplayFit';

interface Props {
  initial: State;
  result: SolverResult;
  onClose: () => void;
}
const actionLabel: Record<string,string> = {
  draw: 'ツモ', 'cpu-turn': 'CPUツモ切り', discard: '打牌',
  'pass-tsumo': 'ツモ見送り', 'pass-naki': '鳴き・ロン見送り',
  ron: 'ロン', tsumo: 'ツモ和了', ankan: '暗槓・嶺上牌ツモ',
};
export default function SolverReplayModal({ initial, result, onClose }: Props) {
  useLayoutEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);
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
  const showRiichi = state.phase === 'playerDiscard' && !state.isRiichi &&
    !!state.playerDrawnTile && (state.mode !== 'four' || hasFuturePlayerDraw(state)) && canRiichi(state.playerHand, state.playerDrawnTile, state.playerFuro);
  const chooseRiichi = (nextAction?.type === 'discard' || nextAction?.type === 'tsumo') && nextAction.riichi;
  const cancelRiichi = nextAction?.type === 'discard' && !nextAction.riichi;
  const choiceClass = (selected: boolean) => `${initial.mode === 'four' ? replayChoiceStyle : 'rounded-lg px-5 py-2.5 font-bold cursor-default'} ${selected ? 'ring-4 ring-yellow-400' : ''}`;
  const nextDiscard = result.outcome !== 'noten'
    ? frames.slice(index + 1, followingStop + 1).map(frame => frame.action)
      .find(action => action?.type === 'discard') ?? null : null;
  const highlightedId = nextDiscard?.type === 'discard' ? nextDiscard.tile.id : null;
  const resultText = result.outcome === 'win' ? `AIの得点 ${result.bestScore?.toLocaleString()}点`
    : result.outcome === 'tenpai' ? 'テンパイ流局 3,000点' : 'ノーテン流局 0点（ツモ切り例）';

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-3">
      <ReplayFit width={initial.mode === 'four' ? 920 : 1040} height={initial.mode === 'four' ? 1160 : 660}>
      <div role="dialog" aria-label="AIの手順" className="bg-[#1a2e1a] border border-green-700 rounded-2xl shadow-2xl w-full h-full overflow-hidden text-white p-4 grid grid-rows-[40px_minmax(0,1fr)_40px] gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold text-xl">AIの手順 — {resultText}</h2>
          <button onClick={onClose} className="rounded-lg bg-gray-600 hover:bg-gray-500 px-4 py-2 font-bold">閉じる</button>
        </div>
        <div className={initial.mode === 'four' ? "min-h-0 grid grid-rows-[minmax(0,1fr)_80px_160px] gap-2" : "min-h-0 grid grid-rows-[52px_76px_76px_112px_minmax(0,1fr)] gap-2"}>
        {initial.mode === 'four' ? <FourPlayerTable state={state} compact /> : <>
        <div className="flex items-center justify-between gap-4">
        <p className="text-green-200 text-sm">手順 {stopPosition + 1} / {stops.length}{'\u3000'}{action ? actionLabel[action.type] : '配牌'}</p>
        <div className="flex items-center gap-1 text-sm"><span>ドラ表示牌：</span>{Array.from({ length: 5 }, (_, i) => {
          const tile = i < state.doraCount ? state.wanpai[4 + i] : null;
          return <div key={i} className="w-8 h-[43px]">{tile && <TileCard tile={tile} size="xs" />}</div>;
        })}</div>
        </div>
        <div data-replay-region="cpu-river" className="overflow-hidden bg-[#152615] border border-[#2d4a2d] rounded-lg px-3 py-1">
          <div className="text-green-400 text-sm mb-1">CPUの捨て牌</div>
          <div className="flex gap-1">
            {state.cpuDiscards.map((tile) => <TileCard key={tile.id} tile={tile} size="xs" />)}
          </div>
        </div>
        <div data-replay-region="player-river" className="overflow-hidden bg-[#172917] border border-[#2d4a2d] rounded-lg px-3 py-1">
          <div className="text-green-400 text-sm mb-1">自分の捨て牌</div>
          <div className="flex gap-1">
            {state.playerDiscards.map(tile => <TileCard key={tile.id} tile={tile} size="xs" dora={isDora(tile)} />)}
          </div>
        </div>
        </>}
        <div data-replay-region="choices" className="min-h-0 flex items-center justify-center p-1">
        {state.phase === 'naki' && state.lastCpuDiscard && (
          <div className="rounded-lg border border-green-700 overflow-hidden">
            <NakiRonButtons phase={state.phase} lastCpuDiscard={state.lastCpuDiscard}
              ronAvailable={state.ronAvailable || replayChoice === 'ron'} nakiOptions={state.nakiOptions}
              readOnly compact={initial.mode !== 'four'} uniformReplayButtons={initial.mode === 'four'} replayChoice={replayChoice}
              onRon={() => {}} onNaki={() => {}} onDeclareKan={() => {}} onPassNaki={() => {}} />
          </div>
        )}
        {state.phase === 'playerDiscard' && (showRiichi || state.tsumoAvailable || nextAction?.type === 'ankan') && (
          <div className="flex flex-wrap items-center justify-center gap-6 rounded-lg border border-green-700 bg-[#1e3a1e] px-4 py-3">
            {nextAction?.type === 'ankan' && <button disabled className={`${choiceClass(true)} bg-purple-600`}>暗槓</button>}
            {showRiichi && <div className="flex gap-3">
              <button disabled className={`${choiceClass(!!chooseRiichi)} bg-blue-600`}>リーチ</button>
              <button disabled className={`${choiceClass(cancelRiichi)} bg-gray-600`} aria-label="リーチをキャンセル">キャンセル</button>
            </div>}
            {state.tsumoAvailable && <div className="flex gap-3">
              <button disabled className={`${choiceClass(nextAction?.type === 'tsumo')} bg-yellow-500 text-yellow-900`}>ツモ</button>
              <button disabled className={`${choiceClass(nextAction?.type === 'pass-tsumo')} bg-gray-600`} aria-label="ツモをキャンセル">キャンセル</button>
            </div>}
          </div>
        )}
        </div>
        <div data-replay-region="hand" className="min-h-0 bg-[#152615] rounded-lg px-3 py-2 grid grid-rows-[20px_72px_64px]">
          <div className="text-green-400 text-sm">手牌{'\u3000'}{state.drawnFromRinshan ? '嶺上牌　' : ''}{highlightedId ? '（黄色枠が次に切る牌）' : ''}</div>
          <div className={initial.mode === 'four' ? "flex items-end gap-6" : "contents"}>
          <div className="grid items-center gap-1" style={{ gridTemplateColumns: `repeat(${initial.mode === 'four' ? Math.max(1, 13 - state.playerFuro.length * 3) : 13},48px) 60px` }}>
            {Array.from({ length: initial.mode === 'four' ? Math.max(1, 13 - state.playerFuro.length * 3) : 13 }, (_, i) => {
              const tile = state.playerHand[i];
              return <div key={i} className={tile && highlightedId === tile.id ? 'ring-4 ring-yellow-400 rounded' : ''}>{tile && <TileCard tile={tile} size="md" dora={isDora(tile)} />}</div>;
            })}
            <div data-replay-region="drawn-tile" className="ml-1 h-16">{state.playerDrawnTile && <div className={highlightedId === state.playerDrawnTile.id ? 'ring-4 ring-yellow-400 rounded' : ''}><TileCard tile={state.playerDrawnTile} size="md" dora={isDora(state.playerDrawnTile)} /></div>}</div>
          </div>
          <div data-replay-region="kan" className={`flex items-center gap-3 ${initial.mode === 'four' ? 'shrink-0' : ''}`}>
            <span className={`${initial.mode === 'four' ? 'hidden' : ''} text-amber-400 text-xs ${state.playerFuro.length ? '' : 'invisible'}`}>暗槓</span>
            {state.playerFuro.map((furo, i) => <div key={i} className="flex gap-1">
              {furo.tiles.map((tile, j) => <TileCard key={tile.id} tile={tile} size={initial.mode === 'four' && state.playerFuro.length >= 3 ? 'xs' : 'sm'} dora={isDora(tile)} faceDown={furo.type === 'ankan' && (j === 0 || j === 3)} />)}
            </div>)}
          </div>
          </div>
        </div>
        </div>
        <div className="shrink-0 flex flex-wrap justify-center gap-2 border-t border-green-800 pt-3">
          <button className="bg-gray-700 rounded-lg px-4 py-2 disabled:opacity-30" disabled={stopPosition === 0} onClick={() => navigate(0)}>最初へ</button>
          <button className="bg-gray-700 rounded-lg px-4 py-2 disabled:opacity-30" disabled={stopPosition === 0} onClick={() => navigate(stopPosition - 1)}>◀ 戻る</button>
          <button className="bg-green-700 rounded-lg px-4 py-2 disabled:opacity-30" disabled={stopPosition === stops.length - 1 && state.phase !== 'win'} onClick={() => state.phase === 'win' ? setScoreDismissed(false) : navigate(stopPosition + 1)}>進む ▶</button>
          <button className="bg-green-700 rounded-lg px-4 py-2 disabled:opacity-30" disabled={stopPosition === stops.length - 1} onClick={() => navigate(stops.length - 1)}>最後へ</button>
        </div>
      </div>
      </ReplayFit>
      {state.phase === 'win' && !scoreDismissed && (
        <div role="dialog" aria-modal="true" aria-labelledby="ai-score-title" className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-3">
          <ReplayFit width={640}>
          <div className="bg-[#2a2a1a] border border-yellow-500 rounded-2xl p-6 flex flex-col items-center gap-5 shadow-2xl text-white">
            <h2 id="ai-score-title" className="text-2xl font-bold">AIの和了 — {state.winType === 'ron' ? 'ロン' : 'ツモ'}</h2>
            {scoreResult?.valid && scoreResult.handInterpretations.length > 0
              ? <YakuDisplay result={scoreResult} />
              : <p className="text-red-300">AIの和了の採点結果を取得できませんでした。</p>}
            <button autoFocus onClick={() => setScoreDismissed(true)} className="rounded-xl bg-gray-600 hover:bg-gray-500 px-6 py-3 font-bold">手順に戻る</button>
          </div>
          </ReplayFit>
        </div>
      )}
    </div>, document.body
  );
}
