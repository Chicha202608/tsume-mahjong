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

export default function App() {
  const [showWall, setShowWall] = useState(false);
  const [showScoreModal, setShowScoreModal] = useState(false);
  const engine = useGameEngine();
  const {
    state,
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

  function handleDismissWin() {
    setShowScoreModal(false);
    dismissGameOver();
  }

  function handleRestart() {
    setShowScoreModal(false);
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
    <div className="bg-[#1a2e1a] flex flex-col overflow-hidden" style={{ width: DESIGN_WIDTH, height: DESIGN_HEIGHT, transform: `scale(${scale})`, transformOrigin: 'top left', fontFamily: "'Segoe UI', system-ui', sans-serif" }}>
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
        />
      )}

      {/* Win overlay — auto-shown for both live and history viewing */}
      {showScoreModal && isValidWin && (
        <GameOverOverlay
          title={winType === 'ron' ? 'ロン！' : 'ツモ！'}
          message="おめでとうございます — あがり！"
          onRestart={handleRestart}
          onOk={handleDismissWin}
          isWin
          scoreResult={scoreResult}
        />
      )}
    </div>
    </div>
    </div>
  );
}
