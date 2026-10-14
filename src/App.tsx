import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Tile } from '@/types';
import { MAX_DRAWS } from '@/game/transitions';
import { useGameEngine } from '@/game/useGameEngine';
import { scoreHand } from '@/game/scoreAdapter';
import StatusBar from '@/components/StatusBar';
import GameOverOverlay from '@/components/GameOverOverlay';
import ConfirmPopup from '@/components/ConfirmPopup';
import HistoryControls from '@/components/HistoryControls';
import Header from '@/components/Header';
import DoraIndicator from '@/components/DoraIndicator';
import CpuSection from '@/components/CpuSection';
import PlayerDiscards from '@/components/PlayerDiscards';
import NakiRonButtons from '@/components/NakiRonButtons';
import HandSection from '@/components/HandSection';
import WallModal from '@/components/WallModal';
import SolverReplayModal from '@/components/SolverReplayModal';
import type { SolverResult } from '@/game/solver';

export default function App() {
  const [showWall, setShowWall] = useState(false);
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [showSolverReplay, setShowSolverReplay] = useState(false);
  const [solverResult, setSolverResult] = useState<SolverResult | null>(null);
  const [solverBusy, setSolverBusy] = useState(false);
  const engine = useGameEngine();
  const {
    state,
    initialState,
    isViewingPast,
    canUndo,
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
    canRiichi,
    riichiValidTiles,
    isDora,
    restart,
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
  } = engine;

  const { playerHand, playerDrawnTile, cpuHand, wall, fullWall, wallDrawnCount, wanpai, playerDiscards, cpuDiscards, playerFuro, phase, turnCount, lastCpuDiscard, nakiOptions, ronAvailable, winType, doraCount, isRiichi, tsumoAvailable, roundWind, playerWind } = state;

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
    // Start as soon as the initial deal exists. Restart only when the deal changes.
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
  }, [initialState]);

  const solverSummary = !solverResult && solverBusy ? '探索中…' : !solverResult ? '探索結果を取得できませんでした'
    : solverResult.outcome === 'win' && solverResult.bestScore !== null
      ? `AIの得点：${solverResult.bestScore.toLocaleString()}点${solverBusy ? '・探索継続中' : ''}`
    : !solverResult.complete || !solverResult.supported ? '通常形の和了手順を発見できませんでした（最高点未確定）'
    : solverResult.outcome === 'tenpai' ? '探索結果：テンパイ'
    : '探索結果：ノーテン';

  const playerScore = scoreResult?.handInterpretations.length
    ? Math.max(...scoreResult.handInterpretations.map(hand => hand.totalWinnings)) : null;
  const scoreDifference = solverResult?.outcome === 'win'
    && solverResult.bestScore !== null && playerScore !== null
    ? playerScore - solverResult.bestScore : null;
  const comparisonText = scoreDifference === null ? solverSummary
    : `${solverSummary} / ${scoreDifference > 0 ? '探索結果を上回りました：+' : scoreDifference < 0 ? 'AIの得点との差：' : '探索結果と同点：'}${scoreDifference.toLocaleString()}点`;

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

  const DESIGN_WIDTH = 1280;
  const DESIGN_HEIGHT = 720;
  const [scale, setScale] = useState(1);
  const updateScale = useCallback(() => {
    setScale(Math.min(window.innerWidth / DESIGN_WIDTH, window.innerHeight / DESIGN_HEIGHT));
  }, []);
  useEffect(() => {
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [updateScale]);

  return (
    <div className="h-dvh w-full bg-black flex items-center justify-center overflow-hidden">
    <div style={{ width: DESIGN_WIDTH * scale, height: DESIGN_HEIGHT * scale }}>
    <div className="bg-[#1a2e1a] flex flex-col overflow-hidden" onDoubleClickCapture={(event) => {
      if (phase !== 'naki' || isViewingPast || pendingAction) return;
      const target = event.target as HTMLElement;
      if (target.closest('button, input, select, textarea, [role="button"]')) return;
      event.preventDefault();
      passNaki();
    }} style={{ width: DESIGN_WIDTH, height: DESIGN_HEIGHT, transform: `scale(${scale})`, transformOrigin: 'top left', fontFamily: "'Segoe UI', system-ui', sans-serif" }}>
      <Header
        turnCount={turnCount}
        maxDraws={MAX_DRAWS}
        wallCount={wall.length}
        isViewingPast={isViewingPast}
        historyIndex={historyIndex}
        historyLength={historyLength}
        onRestart={handleRestart}
        onSetupTest={setupTestState}
      />

      <DoraIndicator
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
      />

      <div className="flex flex-col flex-1 min-h-0 gap-0 overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-scroll [scrollbar-gutter:stable]">
        <CpuSection
          cpuHand={cpuHand}
          cpuFuro={state.cpuFuro}
          cpuDiscards={cpuDiscards}
          lastCpuDiscard={lastCpuDiscard}
          playerFuro={playerFuro}
        />

        <PlayerDiscards playerDiscards={playerDiscards} isDora={isDora} />

        <NakiRonButtons
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
        <div className="shrink-0 px-4 py-2 bg-[#1a2e1a]">
          <StatusBar phase={phase} wallCount={wall.length} isViewingPast={isViewingPast} tsumoAvailable={tsumoAvailable} />
        </div>

        <div className="shrink-0">
          <HandSection
          playerHand={playerHand}
          playerDrawnTile={playerDrawnTile}
          playerFuro={playerFuro}
          phase={phase}
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
          canUndo={canUndo}
          canStepForward={canStepForward}
          onMatta={matta}
          onStepBack={stepBack}
          onStepForward={stepForward}
          />
        </div>
      </div>

      {showWall && (
        <WallModal
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
          message={`ツモ${MAX_DRAWS}回に達しました`}
          onRestart={handleRestart}
          onOk={handleDismissWin}
          solverSummary={solverSummary ?? undefined}
          onShowSolver={solverResult?.supported && (solverResult.complete || solverResult.line.length > 0) ? () => setShowSolverReplay(true) : undefined}
        />
      )}

      {/* Win overlay — auto-shown for both live and history viewing */}
      {showScoreModal && isValidWin && (
        <GameOverOverlay
          title={winType === 'ron' ? 'ロン！' : 'ツモ！'}
          message=""
          onRestart={handleRestart}
          onOk={handleDismissWin}
          isWin
          scoreResult={scoreResult}
          solverSummary={comparisonText ?? undefined}
          onShowSolver={solverResult?.supported && solverResult.line.length > 0 ? () => setShowSolverReplay(true) : undefined}
        />
      )}
      {showSolverReplay && solverResult?.supported && (solverResult.complete || solverResult.line.length > 0) && (
        <SolverReplayModal initial={initialState} result={solverResult} onClose={() => setShowSolverReplay(false)} />
      )}
    </div>
    </div>
    </div>
  );
}
