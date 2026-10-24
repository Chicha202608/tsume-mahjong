import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Tile } from '@/types';
import type { GameMode } from '@/game/gameState';
import { getDoraTileKeys, tileDisplay, tileKey } from '@/gameLogic';
import {
  createSoloState, currentSoloResponse, SEAT_NAMES, soloHistoryReducer,
  soloKanOptions, soloPerspective, soloRiichiTiles, soloScore,
  type SoloAction, type SoloHistory, type SoloSeat, type SoloState,
} from '@/game/soloFour';
import FourPlayerTable from '@/components/FourPlayerTable';
import HandSection from '@/components/HandSection';
import Header from '@/components/Header';
import NakiRonButtons from '@/components/NakiRonButtons';
import ConfirmPopup from '@/components/ConfirmPopup';
import YakuDisplay from '@/components/YakuDisplay';
import SoloFourWall from '@/components/SoloFourWall';

const buttonStyle = 'rounded-lg border border-emerald-700 bg-emerald-950 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-30';
const meldNames = { pung: 'ポン', chii: 'チー', kan: 'カン', ankan: '暗槓', daiminkan: '大明槓', kakan: '加槓' };
const DESIGN_WIDTH = 1440;
const DESIGN_HEIGHT = 960;

function outcomeText(state: SoloState): string {
  if (!state.result) return '';
  if (state.result.type === 'draw') return state.result.tenpai.length ? `流局 ／ テンパイ：${state.result.tenpai.map(w => `${SEAT_NAMES[w]}家`).join('・')}` : '流局 ／ 全員ノーテン';
  return `${state.result.winners.map(w => `${SEAT_NAMES[w.wind]}家`).join('・')}の${state.result.type === 'ron' ? 'ロン' : 'ツモ'}`;
}

export default function SoloFourGame({ onHome, onMode }: { onHome: () => void; onMode?: (mode: GameMode) => void }) {
  const [history, dispatch] = useReducer(soloHistoryReducer, undefined, (): SoloHistory => ({
    entries: [{ state: createSoloState() }], index: 0, pending: null,
  }));
  const [showResult, setShowResult] = useState(true);
  const [showWall, setShowWall] = useState(false);
  const [revealTiles, setRevealTiles] = useState(true);
  const [scale, setScale] = useState(1);
  const lastActionAt = useRef(-Infinity);
  const state = history.entries[history.index].state;
  const seat: SoloSeat = state.seats[state.turn];
  const visibleSeat = state.seats[state.view];
  const perspective = soloPerspective(state);
  const response = currentSoloResponse(state);
  const riichiTiles = useMemo(() => soloRiichiTiles(state), [state]);
  const kanOptions = useMemo(() => soloKanOptions(state), [state]);
  const tsumo = useMemo(() => state.phase === 'discard' && seat.drawn ? soloScore(state, state.turn, seat.drawn, 'tsumo') : null, [state, seat]);
  const doraKeys = getDoraTileKeys(state.wanpai, state.doraCount);
  const isDora = (tile: Tile) => doraKeys.has(tileKey(tile));
  const isViewingPast = history.index < history.entries.length - 1;
  useEffect(() => {
    const resize = () => setScale(Math.min(window.innerWidth / DESIGN_WIDTH, window.innerHeight / DESIGN_HEIGHT));
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const act = (action: SoloAction) => {
    // Prevent a double click from operating the next seat after rotation.
    const now = performance.now();
    if (!history.pending && !showWall && now - lastActionAt.current >= 220) {
      lastActionAt.current = now;
      setShowResult(true);
      dispatch({ type: 'act', action });
    }
  };
  const discard = (tile: Tile) => act({ type: 'discard', tileId: tile.id });
  const canDiscardTile = (tile: Tile) => (state.phase === 'discard' || state.phase === 'riichi') &&
    !history.pending && !showWall && !visibleSeat.forbiddenDiscards.includes(tileKey(tile)) &&
    (!visibleSeat.riichi || tile.id === visibleSeat.drawn?.id) &&
    (state.phase !== 'riichi' || riichiTiles.has(tile.id));
  const restart = () => {
    setShowResult(true); setShowWall(false);
    dispatch({ type: 'restart', state: createSoloState() });
  };
  const status = state.phase === 'end' ? outcomeText(state) : state.phase === 'response'
    ? `${SEAT_NAMES[state.turn]}家の${state.pending?.kind === 'discard' ? '打牌' : '槓'}に、${SEAT_NAMES[state.view]}家が応答中`
    : `${SEAT_NAMES[state.turn]}家の手番${state.phase === 'riichi' ? ' ／ リーチ宣言牌を選択' : !seat.drawn ? ' ／ 鳴いた後の打牌を選択' : ''}`;

  return <main className="h-dvh w-full bg-black flex items-center justify-center overflow-hidden">
    <div style={{ width: DESIGN_WIDTH * scale, height: DESIGN_HEIGHT * scale }}>
      <div className="relative bg-[#1a2e1a] text-white flex flex-col overflow-hidden"
        onDoubleClickCapture={event => {
          if (isViewingPast || history.pending || showWall || (state.result && showResult)) return;
          const target = event.target as HTMLElement;
          if (target.closest('button, input, select, textarea, [role="button"], [data-tile-card]')) return;
          if (state.phase === 'response' && response) {
            event.preventDefault();
            act({ type: 'respond', choice: 'pass' });
          } else if (state.phase === 'discard' && seat.drawn && canDiscardTile(seat.drawn)) {
            event.preventDefault();
            discard(seat.drawn);
          }
        }}
        style={{ width: DESIGN_WIDTH, height: DESIGN_HEIGHT, transform: `scale(${scale})`, transformOrigin: 'top left', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
        <Header onHome={onHome} mode="solo-four" onMode={onMode}
          turnCount={perspective.turnCount} maxDraws={18} wallCount={state.wall.length}
          isViewingPast={isViewingPast} historyIndex={history.index} historyLength={history.entries.length}
          onRestart={restart} modeDetails={<div className="text-center text-xs leading-6 text-emerald-200">
            <p>{SEAT_NAMES[state.roundWind]}場・全席手動操作</p>
            <p className="text-amber-200">{SEAT_NAMES[state.view]}家の視点</p>
          </div>}
          rightDetails={<div className="text-center text-xs leading-6 text-emerald-200">
            <div className="mt-2 flex flex-col gap-1">
              <span>牌の表示</span>
              <button type="button" aria-label="牌の公開" aria-pressed={revealTiles}
                onClick={() => setRevealTiles(current => !current)}
                className={`rounded-lg border px-2 py-2 text-sm font-bold ${revealTiles ? 'border-amber-500 bg-amber-500 text-black hover:bg-amber-400' : 'border-emerald-700 bg-emerald-950 text-white hover:bg-emerald-800'}`}>
                {revealTiles ? '公開' : '非公開'}
              </button>
            </div>
            <p className="mt-1 leading-4">他家の手牌・未公開の<br />カンドラ表示牌</p>
            <p>暗槓は全牌公開</p>
          </div>} />
        <div className="flex flex-col flex-1 min-h-0 gap-0 overflow-hidden mx-[168px] my-3 rounded-xl border border-emerald-800 bg-[#073b2d]">
          <div className="flex-1 min-h-0">
            <FourPlayerTable state={perspective} embedded publicSeats={state.seats} activeWind={state.turn} revealTiles={revealTiles} />
          </div>
          <div className="h-14 shrink-0 flex items-center justify-center gap-3">
            {state.phase === 'response' && response && <NakiRonButtons largeChoices phase="naki" lastCpuDiscard={state.pending!.tile}
              ronAvailable={response.ron} nakiOptions={response.options}
              onRon={() => act({ type: 'respond', choice: 'ron' })}
              onNaki={option => act({ type: 'respond', choice: option })}
              onDeclareKan={option => act({ type: 'respond', choice: option })}
              onPassNaki={() => act({ type: 'respond', choice: 'pass' })} />}
            {kanOptions.map((option, i) => <button key={i} className="rounded-lg bg-purple-700 px-4 py-2 text-white"
              onClick={() => act({ type: 'kan', option })}>{meldNames[option.type]}：{tileDisplay(option.tiles[0]).label}</button>)}
            {state.phase === 'riichi' && <button className={buttonStyle} onClick={() => act({ type: 'cancelRiichi' })}>リーチを取り消す</button>}
            {state.phase === 'end' && <button className={buttonStyle} onClick={() => setShowResult(true)}>結果を表示</button>}
          </div>
          <div aria-live="polite" className="h-7 shrink-0 px-4 flex items-center justify-center text-sm text-amber-200">{status}</div>
          <HandSection fourPlayer publicTiles playerWind={state.view}
            playerHand={visibleSeat.hand} playerDrawnTile={visibleSeat.drawn} playerFuro={visibleSeat.furo}
            phase={perspective.phase} isRiichi={visibleSeat.riichi} isViewingPast={isViewingPast}
            canTsumo={!!tsumo} canRiichi={state.phase === 'discard' && riichiTiles.size > 0}
            riichiValidTiles={riichiTiles} isDora={isDora} canDiscardTile={canDiscardTile}
            onDiscard={discard} onNakiDiscard={discard} onRiichiDiscard={discard}
            onDeclareTsumo={() => act({ type: 'tsumo' })} onDeclareRiichi={() => act({ type: 'riichi' })}
            onShowWall={() => setShowWall(true)} canUndo={history.index > 0 && !history.pending}
            canStepBack={history.index > 0 && !history.pending}
            canStepForward={isViewingPast && !history.pending}
            onMatta={() => dispatch({ type: 'matta' })} onStepBack={() => dispatch({ type: 'back' })}
            onStepForward={() => { setShowResult(true); dispatch({ type: 'forward' }); }}
            onFirst={() => dispatch({ type: 'first' })}
            onLast={() => { setShowResult(true); dispatch({ type: 'last' }); }} />
        </div>
        {showWall && <SoloFourWall state={state} onClose={() => setShowWall(false)} />}
        {history.pending && <ConfirmPopup message="これ以降の牌譜は消去されますが、よろしいですか？"
          onConfirm={() => dispatch({ type: 'confirm' })} onCancel={() => dispatch({ type: 'cancel' })} />}
        {state.result && showResult && !history.pending && <div role="dialog" aria-modal="true" aria-label="対局結果" className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-amber-500 bg-[#173322] p-6">
            <h2 className="mb-4 text-2xl font-bold text-amber-200">{outcomeText(state)}</h2>
            {state.result.winners.map(winner => <div key={winner.wind} className="mb-5"><h3 className="mb-2 font-bold">{SEAT_NAMES[winner.wind]}家</h3><YakuDisplay result={winner.analysis} /></div>)}
            <div className="flex justify-center gap-3"><button className={buttonStyle} onClick={() => setShowResult(false)}>牌譜を見る</button><button className={buttonStyle} onClick={restart}>もう一局</button></div>
          </div>
        </div>}
      </div>
    </div>
  </main>;
}
