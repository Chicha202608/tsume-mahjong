import { isTableMode } from '@/game/seatFlow';
import { drawSettlement } from '@/game/drawSettlement';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { MAX_DRAWS } from '@/game/transitions';
import { useGameEngine } from '@/game/useGameEngine';
import { scoreHand } from '@/game/scoreAdapter';
import StatusBar from '@/components/StatusBar';
import GameOverOverlay from '@/components/GameOverOverlay';
import DailyRankingPanel from '@/components/DailyRankingPanel';
import { makeDailyShare } from '@/components/dailyShareImage';
import ConfirmPopup from '@/components/ConfirmPopup';
import Header from '@/components/Header';
import DoraIndicator from '@/components/DoraIndicator';
import CpuSection from '@/components/CpuSection';
import PlayerDiscards from '@/components/PlayerDiscards';
import NakiRonButtons from '@/components/NakiRonButtons';
import HandSection from '@/components/HandSection';
import WallModal from '@/components/WallModal';
import SolverReplayModal from '@/components/SolverReplayModal';
import FourPlayerTable from '@/components/FourPlayerTable';
import AIAnalysisModal from '@/components/AIAnalysisModal';
import type { SolverResult } from '@/game/solver';
import type { GameMode } from '@/game/gameState';
import { dailyRoundSearch, millisecondsUntilJapanMidnight, readDailyRoundDate, todayInJapan } from '@/game/dailyRound';
import ModeSelect, { type PlayMode } from '@/components/ModeSelect';
import SoloFourGame from '@/components/SoloFourGame';
import { useDailyRanking } from '@/game/useDailyRanking';

const modeLabels: Record<GameMode, string> = {
  two: '二人モード',
  three: '三人モード',
  four: '四人モード',
};

export default function App() {
  const [mode, setSelectedMode] = useState<PlayMode | null>(null);
  const [dailyDate] = useState(() => readDailyRoundDate(window.location.search));

  useEffect(() => {
    if (dailyDate && new URLSearchParams(window.location.search).get('daily') === 'today') {
      window.history.replaceState(null, '', dailyRoundSearch(dailyDate));
    }
  }, [dailyDate]);

  if (dailyDate) return <Game initialMode="four" dailyDate={dailyDate} onHome={() => window.location.assign(import.meta.env.BASE_URL)} />;
  if (mode === null) return <ModeSelect onSelect={setSelectedMode} />;
  if (mode === 'solo-four') return <SoloFourGame onHome={() => setSelectedMode(null)} onMode={setSelectedMode} />;
  return <Game initialMode={mode} onHome={() => setSelectedMode(null)} />;
}

function Game({ initialMode, onHome, dailyDate }: { initialMode: GameMode; onHome: () => void; dailyDate?: string }) {
  const [showAI, setShowAI] = useState(false);
  const [showWall, setShowWall] = useState(false);
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [showSolverReplay, setShowSolverReplay] = useState(false);
  const [solverResult, setSolverResult] = useState<SolverResult | null>(null);
  const [solverBusy, setSolverBusy] = useState(false);
  const [japanDay, setJapanDay] = useState(todayInJapan);
  const [ranked] = useState(() => import.meta.env.VITE_DAILY_RANKING_ENABLED === 'true' && dailyDate === todayInJapan());
  const canShowAI = !dailyDate || dailyDate < japanDay;
  const ranking = useDailyRanking(ranked ? dailyDate : undefined);
  const canRewrite = !ranked || canShowAI || !!ranking.result;
  const engine = useGameEngine(initialMode, dailyDate, ranked, canRewrite);
  const {
    state,
    initialState,
    rankingMoves,
    isViewingPast,
    canUndo,
    canStepBack,
    canStepForward,
    historyIndex,
    historyLength,
    pendingAction,
    confirmPendingAction,
    cancelPendingAction,
    dismissedIndex,
    dismissGameOver,
    canTsumo,
    ankanOptions,
    kakanOptions,
    nukiOptions, nuki,
    canRiichi,
    riichiValidTiles,
    isDora,
    restart,
    setMode,
    setupTestState,
    playerDiscard,
    playerNakiDiscard,
    riichiDiscard,
    callRon,
    callNaki,
    passNaki,
    passTsumo,
    declareTsumo,
    declareKan,
    declareRiichi,
    matta,
    stepBack,
    stepForward,
    goToFirst,
    goToLast,
  } = engine;

  const { playerHand, playerDrawnTile, cpuHand, wall, fullWall, wallDrawnCount, wanpai, playerDiscards, cpuDiscards, playerFuro, phase, turnCount, lastCpuDiscard, nakiOptions, ronAvailable, winType, doraCount, isRiichi, tsumoAvailable, roundWind, playerWind } = state;
  const { record: recordRanking } = ranking;
  useEffect(() => {
    if (rankingMoves) recordRanking(rankingMoves);
  }, [rankingMoves, recordRanking]);
  const readOnlyHistory = isViewingPast && !canRewrite;
  const rankingPanel = ranked && (rankingMoves || ranking.result || ranking.busy || ranking.error)
    ? <DailyRankingPanel ranking={ranking} /> : undefined;

  const scoreResult = useMemo(() => {
    if (phase !== 'win') return null;
    try {
      return scoreHand(state);
    } catch {
      return null;
    }
  }, [state, phase]);

  const isValidWin = phase === 'win' && !!scoreResult && scoreResult.valid && scoreResult.handInterpretations.length > 0;

  // Auto-show the score modal whenever historyIndex changes to a win state.
  const prevHistoryIndexRef = useRef<number>(historyIndex);
  useEffect(() => {
    if (prevHistoryIndexRef.current !== historyIndex && isValidWin) {
      setShowScoreModal(true);
    }
    prevHistoryIndexRef.current = historyIndex;
  }, [historyIndex, isValidWin]);

  useEffect(() => {
    if (canShowAI) return;
    const now = new Date();
    const currentDay = todayInJapan(now);
    if (currentDay !== japanDay) {
      setJapanDay(currentDay);
      return;
    }
    const timer = window.setTimeout(() => setJapanDay(todayInJapan()), millisecondsUntilJapanMidnight(now));
    return () => window.clearTimeout(timer);
  }, [canShowAI, japanDay]);

  useEffect(() => {
    setShowAI(false);
    setShowWall(false);
    setShowScoreModal(false);
    setShowSolverReplay(false);
  }, [initialState]);

  useEffect(() => {
    if (!canShowAI) return;
    // Searching must not depend on the current phase or history navigation.
    setSolverResult(null);
    setSolverBusy(true);
    const worker = new Worker(new URL('./game/solver.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ result?: SolverResult; error?: string; preliminary?: boolean }>) => {
      setSolverResult(event.data.result ?? null);
      if (!event.data.preliminary) {
        setSolverBusy(false);
        worker.terminate();
      }
    };
    worker.onerror = () => {
      setSolverResult(null);
      setSolverBusy(false);
      worker.terminate();
    };
    worker.postMessage(initialState);
    return () => worker.terminate();
  }, [canShowAI, initialState]);

  const solverSummary = !solverResult && solverBusy ? '探索中…' : !solverResult ? '探索結果を取得できませんでした'
    : solverResult.outcome === 'win' && solverResult.bestScore !== null
      ? `AIの得点：${solverResult.bestScore.toLocaleString()}点${solverBusy ? '・探索継続中' : ''}`
    : solverResult.outcome === 'tenpai' ? `AIの得点：${solverResult.bestScore?.toLocaleString()}点（テンパイ流局）${solverBusy ? '・探索継続中' : ''}`
    : solverResult.outcome === 'noten' ? 'AIの得点：0点（ノーテン流局）'
    : !solverResult.complete || !solverResult.supported ? 'AI：ノーテン'
    : '探索結果：ノーテン';

  const settlement = drawSettlement(state);
  const modeLabel = modeLabels[state.mode ?? 'two'];
  const drawMessage = settlement?.tenpai ? 'テンパイ流局：3,000点' : 'ノーテン流局：0点';
  const playerScore = settlement ? settlement.score : scoreResult?.handInterpretations.length
    ? Math.max(...scoreResult.handInterpretations.map(hand => hand.totalWinnings)) : null;
  const scoreLabel = playerScore === null ? undefined : `${playerScore.toLocaleString('ja-JP')}点`;
  const scoreDifference = solverResult && solverResult.bestScore !== null && playerScore !== null
    ? playerScore - solverResult.bestScore : null;
  const comparisonText = scoreDifference === null ? solverSummary
    : scoreDifference === 0 ? `${solverSummary} / AIとの点差：0点`
    : `${solverSummary} / AIとの点差：${scoreDifference > 0 ? '+' : ''}${scoreDifference.toLocaleString()}点`;

  function handleDismissWin() {
    setShowScoreModal(false);
    dismissGameOver();
  }

  function handleRestart() {
    setShowScoreModal(false);
    setShowSolverReplay(false);
    setSolverResult(null);
    restart();
  }

  const onRestart = dailyDate ? undefined : handleRestart;
  const dailyShare = dailyDate ? makeDailyShare(dailyDate, initialState) : undefined;
  const fourPlayer = isTableMode(state);
  const DESIGN_WIDTH = fourPlayer ? 1440 : 1280;
  const DESIGN_HEIGHT = fourPlayer ? 960 : 720;
  const [scale, setScale] = useState(1);
  const updateScale = useCallback(() => {
    setScale(Math.min(window.innerWidth / DESIGN_WIDTH, window.innerHeight / DESIGN_HEIGHT));
  }, [DESIGN_WIDTH, DESIGN_HEIGHT]);
  useEffect(() => {
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [updateScale]);

  return (
    <div className="h-dvh w-full bg-black flex items-center justify-center overflow-hidden">
    <div style={{ width: DESIGN_WIDTH * scale, height: DESIGN_HEIGHT * scale }}>
    <div className="relative bg-[#1a2e1a] flex flex-col overflow-hidden" onDoubleClickCapture={(event) => {
      if (isViewingPast || pendingAction || showWall || showScoreModal || showSolverReplay || showAI) return;
      const target = event.target as HTMLElement;
      // Tile faces and buttons must retain their normal click behavior.
      if (target.closest('button, input, select, textarea, [role="button"], [data-tile-card]')) return;
      if (phase === 'naki') {
        event.preventDefault();
        passNaki();
      } else if (phase === 'playerDiscard' && playerDrawnTile && !isRiichi) {
        event.preventDefault();
        playerDiscard(playerDrawnTile);
      }
    }} style={{ width: DESIGN_WIDTH, height: DESIGN_HEIGHT, transform: `scale(${scale})`, transformOrigin: 'top left', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <Header
        onHome={onHome}
        mode={state.mode ?? 'two'} onMode={dailyDate ? undefined : setMode} onAI={canShowAI ? () => setShowAI(true) : undefined}
        turnCount={turnCount}
        maxDraws={MAX_DRAWS}
        wallCount={wall.length}
        isViewingPast={isViewingPast}
        historyIndex={historyIndex}
        historyLength={historyLength}
        onRestart={onRestart}
        onSetupTest={dailyDate || state.mode === 'three' ? undefined : setupTestState}
        modeDetails={dailyDate
          ? <div className="text-center"><p className="text-sm font-bold text-amber-200">日替わり対局<br /><time dateTime={dailyDate}>{dailyDate}</time></p>
            {ranked && !canShowAI && <p className="mt-2 text-xs text-emerald-200">{ranking.result
              ? '初回結果は登録済みです。待ったで打ち直せます。'
              : '初回の結果をランキングに記録します。待ったは登録後に使えます。'}</p>}</div>
          : state.mode === 'three' ? <p className="text-xs leading-6 text-emerald-200">萬子2〜8なし<br />北抜き・ツモ損あり<br />チーなし</p> : undefined}
      />

      {!fourPlayer && <DoraIndicator
        wanpai={wanpai}
        doraCount={doraCount}
        ankanOptions={ankanOptions}
        kakanOptions={kakanOptions}
        phase={phase}
        isViewingPast={isViewingPast}
        onDeclareKan={declareKan}
        roundWind={roundWind}
        playerWind={playerWind}
        cpuHand={cpuHand}
      />}

      <div className={fourPlayer ? "flex flex-col flex-1 min-h-0 gap-0 overflow-hidden mx-[168px] my-3 rounded-xl border border-emerald-800 bg-[#073b2d]" : "flex flex-col flex-1 min-h-0 gap-0 overflow-hidden"}>
        {fourPlayer ? <div className="flex-1 min-h-0"><FourPlayerTable state={state} embedded /></div> : <div className="flex-1 min-h-0 overflow-y-scroll [scrollbar-gutter:stable]">
        <CpuSection
          cpuHand={cpuHand}
          cpuFuro={state.cpuFuro}
          cpuDiscards={cpuDiscards}
          lastCpuDiscard={lastCpuDiscard}
          playerFuro={playerFuro}
        />

        <PlayerDiscards playerDiscards={playerDiscards} isDora={isDora} />

        </div>}

        {/* Keep call and ron controls visible below the scrolling river. */}
        <div className={fourPlayer ? "h-14 shrink-0 flex items-center justify-center gap-3" : "shrink-0"}>
          {!isViewingPast && nukiOptions.length > 0 && <button onClick={() => nuki(nukiOptions[nukiOptions.length - 1])} className="rounded-lg bg-sky-700 px-4 py-2 font-bold text-white">北抜き</button>}
          {fourPlayer && !isViewingPast && phase === 'playerDiscard' && [...ankanOptions, ...kakanOptions].map((option, i) => <button key={i} onClick={() => declareKan(option)} className="rounded-lg bg-purple-700 px-4 py-2 text-white">{option.type === 'ankan' ? '暗槓' : '加槓'} {option.tiles[0].value}{option.tiles[0].suit === 'pin' ? 'p' : option.tiles[0].suit === 'sou' ? 's' : option.tiles[0].suit === 'man' ? 'm' : 'z'}</button>)}
          <NakiRonButtons
            largeChoices={fourPlayer}
            readOnly={readOnlyHistory}
            phase={phase}
            lastCpuDiscard={lastCpuDiscard}
            ronAvailable={ronAvailable}
            nakiOptions={nakiOptions}
            onRon={callRon}
            onNaki={callNaki}
            onDeclareKan={declareKan}
            onPassNaki={passNaki}
          />
        </div>

        {/* Status bar */}
        <div className={fourPlayer ? `shrink-0 px-4 flex items-center justify-center ${state.mode === 'four' ? 'h-5' : 'h-7'}` : "shrink-0 px-4 py-2 bg-[#1a2e1a]"}>
          <StatusBar phase={phase} wallCount={wall.length} isViewingPast={isViewingPast} tsumoAvailable={tsumoAvailable} />
        </div>

        <div className="shrink-0">
          <HandSection
          fourPlayer={fourPlayer}
          playerHand={playerHand}
          playerDrawnTile={playerDrawnTile}
          playerFuro={playerFuro}
          phase={phase}
          isRiichi={isRiichi}
          isViewingPast={isViewingPast}
          canTsumo={canTsumo}
          canRiichi={canRiichi}
          riichiValidTiles={riichiValidTiles}
          isDora={isDora}
          onDiscard={playerDiscard}
          onNakiDiscard={playerNakiDiscard}
          onRiichiDiscard={riichiDiscard}
          onDeclareTsumo={declareTsumo}
          onPassTsumo={passTsumo}
          onDeclareRiichi={declareRiichi}
          onShowWall={() => setShowWall(true)}
          readOnly={readOnlyHistory}
          canUndo={canUndo}
          canStepBack={canStepBack}
          canStepForward={canStepForward}
          onMatta={matta}
          onStepBack={stepBack}
          onStepForward={stepForward}
          onFirst={goToFirst}
          onLast={goToLast}
          />
        </div>
      </div>

      {showWall && (
        <WallModal
          state={state}
          wall={wall}
          fullWall={fullWall}
          wallDrawnCount={wallDrawnCount}
          doraCount={doraCount}
          wanpai={wanpai}
          phase={phase}
          turnCount={turnCount}
          onClose={() => setShowWall(false)}
        />
      )}

      {pendingAction && (
        <ConfirmPopup
          message={pendingAction.message}
          onConfirm={confirmPendingAction}
          onCancel={cancelPendingAction}
        />
      )}

      {/* Exhausted overlay */}
      {phase === 'exhausted' && !isViewingPast && dismissedIndex !== historyIndex && (
        <GameOverOverlay
          title="流局"
          message={drawMessage}
          shareText={dailyDate ? scoreLabel : `${modeLabel}で${drawMessage}`}
          dailyShare={dailyShare}
          ranking={rankingPanel}
          onRestart={onRestart}
          onOk={handleDismissWin}
          solverSummary={canShowAI ? comparisonText : undefined}
          onShowSolver={canShowAI && solverResult?.supported && (solverResult.complete || solverResult.line.length > 0) ? () => setShowSolverReplay(true) : undefined}
        />
      )}

      {/* Win overlay — auto-shown for both live and history viewing */}
      {showScoreModal && isValidWin && (
        <GameOverOverlay
          title={winType === 'ron' ? 'ロン！' : 'ツモ！'}
          message=""
          shareText={dailyDate || !scoreLabel ? scoreLabel : `${modeLabel}で${winType === 'ron' ? 'ロン' : 'ツモ'}：${scoreLabel}`}
          dailyShare={dailyShare}
          ranking={rankingPanel}
          onRestart={onRestart}
          onOk={handleDismissWin}
          isWin
          scoreResult={scoreResult}
          solverSummary={canShowAI ? comparisonText : undefined}
          onShowSolver={canShowAI && solverResult?.supported && solverResult.line.length > 0 ? () => setShowSolverReplay(true) : undefined}
        />
      )}
      {canShowAI && showAI && <AIAnalysisModal summary={comparisonText} canReplay={!!solverResult?.supported && (solverResult.complete || solverResult.line.length > 0)} onClose={() => setShowAI(false)} onReplay={() => { setShowAI(false); setShowSolverReplay(true); }} />}
      {canShowAI && showSolverReplay && solverResult?.supported && (solverResult.complete || solverResult.line.length > 0) && (
        <SolverReplayModal initial={initialState} result={solverResult} onClose={() => setShowSolverReplay(false)} />
      )}
    </div>
    </div>
    </div>
  );
}
