import { useState } from 'react';
import { Tile } from '@/types';
import { MAX_DRAWS } from '@/game/transitions';
import { useGameEngine } from '@/game/useGameEngine';
import StatusBar from '@/components/StatusBar';
import GameOverOverlay from '@/components/GameOverOverlay';
import ConfirmPopup from '@/components/ConfirmPopup';
import HistoryControls from '@/components/HistoryControls';
import DebugButtons from '@/components/DebugButtons';
import Header from '@/components/Header';
import DoraIndicator from '@/components/DoraIndicator';
import CpuSection from '@/components/CpuSection';
import PlayerDiscards from '@/components/PlayerDiscards';
import PlayerFuro from '@/components/PlayerFuro';
import NakiRonButtons from '@/components/NakiRonButtons';
import HandSection from '@/components/HandSection';
import WallModal from '@/components/WallModal';

export default function App() {
  const [showWall, setShowWall] = useState(false);
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

  const { playerHand, playerDrawnTile, cpuHand, wall, fullWall, wallDrawnCount, wanpai, playerDiscards, cpuDiscards, playerFuro, phase, turnCount, lastCpuDiscard, nakiOptions, ronAvailable, winType, doraCount, isRiichi, tsumoAvailable } = state;

  return (
    <div className="min-h-screen bg-[#1a2e1a] -col" style={{ fontFamily: "'Segoe UI', system-ui', sans-serif" }}>
      <Header
        turnCount={turnCount}
        maxDraws={MAX_DRAWS}
        wallCount={wall.length}
        isViewingPast={isViewingPast}
        historyIndex={historyIndex}
        historyLength={historyLength}
        onRestart={restart}
      />

      <DoraIndicator
        wanpai={wanpai}
        doraCount={doraCount}
        ankanOptions={ankanOptions}
        kakanOptions={kakanOptions}
        phase={phase}
        isViewingPast={isViewingPast}
        onDeclareKan={declareKan}
      />

      <HistoryControls
        canUndo={canUndo}
        canStepForward={canStepForward}
        onMatta={matta}
        onStepBack={stepBack}
        onStepForward={stepForward}
      />
      <DebugButtons onSetupTest={setupTestState} />

      <div className="-col flex-1 gap-0 overflow-hidden">
        <CpuSection
          cpuHand={cpuHand}
          cpuFuro={state.cpuFuro}
          cpuDiscards={cpuDiscards}
          lastCpuDiscard={lastCpuDiscard}
        />

        <PlayerDiscards playerDiscards={playerDiscards} isDora={isDora} />

        <PlayerFuro playerFuro={playerFuro} isDora={isDora} />

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

        {/* Status bar */}
        <div className="px-4 py-2 bg-[#1a2e1a]">
          <StatusBar phase={phase} wallCount={wall.length} isViewingPast={isViewingPast} tsumoAvailable={tsumoAvailable} />
        </div>

        <HandSection
          playerHand={playerHand}
          playerDrawnTile={playerDrawnTile}
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
        />
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

      {/* Game over overlays */}
      {(() => {
        const isGameOver = (phase === 'win' || phase === 'exhausted') && !isViewingPast;
        const showGameOver = isGameOver && dismissedIndex !== historyIndex;
        if (!showGameOver) return null;
        return phase === 'exhausted' ? (
          <GameOverOverlay
            title="流局"
            message={`ツモ${MAX_DRAWS}回に達しました`}
            onRestart={restart}
            onOk={dismissGameOver}
          />
        ) : (
          <GameOverOverlay
            title={winType === 'ron' ? 'ロン！' : 'ツモ！'}
            message="おめでとうございます — あがり！"
            onRestart={restart}
            onOk={dismissGameOver}
            isWin
          />
        );
      })()}
    </div>
  );
}
