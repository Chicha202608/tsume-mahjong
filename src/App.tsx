import { useState, useCallback, useEffect, useRef } from 'react';
import { Tile, Furo } from '@/types';
import { createDeck, shuffle, sortHand, findAnkanOptions, findKakanOptions, isMenzen as isMenzenLogic, canRiichi as canRiichiLogic, validRiichiDiscards, getDoraTileKeys, NakiOption } from '@/gameLogic';
import { State, makeInitialState, makeInitialStateBase } from '@/game/gameState';
import {
  MAX_DRAWS,
  applyPlayerDraw,
  applyPlayerDiscard,
  applyCpuTurn,
  applyCallRon,
  applyCallNaki,
  applyPlayerNakiDiscard,
  applyPassNaki,
  applyPassTsumo,
  applyDeclareTsumo,
  applyDeclareKan,
  applyDeclareRiichi,
  applyRiichiDiscard,
} from '@/game/transitions';
import {
  isStopState,
  actionMatchesNext,
  commitNewState,
  findPrevStopIndex,
  findNextStopIndex,
  riichiDiscardMatchesNext,
} from '@/game/history';
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
  const [history, setHistory] = useState<State[]>(() => [makeInitialState()]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const canUndo = historyIndex > 1;
  const [showWall, setShowWall] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ action: () => void; message: string } | null>(null);
  const [dismissedIndex, setDismissedIndex] = useState(-1);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const state = history[historyIndex] ?? history[0] ?? makeInitialState();
  const isViewingPast = historyIndex < history.length - 1;

  const initNewGame = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const s = makeInitialState();
    setHistory([s]);
    setHistoryIndex(0);
    setDismissedIndex(-1);
  }, []);

  const restart = useCallback(() => {
    initNewGame();
  }, [initNewGame]);

  const setupTestState = useCallback((mode: 'ankan' | 'kakan' | 'daiminkan') => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    const deck = shuffle(createDeck());

    const suits = ['man', 'pin', 'sou', 'wind', 'dragon'] as const;
    const suit = suits[Math.floor(Math.random() * suits.length)];
    const maxVal = suit === 'wind' ? 4 : suit === 'dragon' ? 3 : 9;
    const value = Math.floor(Math.random() * maxVal) + 1;

    const tileATiles = deck.filter(t => t.suit === suit && t.value === value);
    const remaining = deck.filter(t => !(t.suit === suit && t.value === value));

    const baseHand = remaining.slice(0, 10);
    const cpuHand = sortHand(remaining.slice(10, 23));
    const wanpai = remaining.slice(23, 37);
    const wallTiles = remaining.slice(37);

    let newState: State;

    if (mode === 'ankan') {
      const hand = sortHand([...baseHand, ...tileATiles.slice(0, 3)]);
      const wall = [tileATiles[3], ...wallTiles];
      newState = {
        ...makeInitialStateBase(hand, cpuHand, wall, wanpai),
      };
    } else if (mode === 'kakan') {
      const pungFuro: Furo = {
        tiles: tileATiles.slice(0, 3),
        type: 'pung',
        calledTile: tileATiles[0],
      };
      const hand = sortHand(baseHand);
      const wall = [tileATiles[3], ...wallTiles];
      newState = {
        ...makeInitialStateBase(hand, cpuHand, wall, wanpai),
        playerFuro: [pungFuro],
      };
    } else {
      const hand = sortHand([...baseHand, ...tileATiles.slice(0, 3)]);
      const wall = [wallTiles[0], tileATiles[3], ...wallTiles.slice(1)];
      newState = {
        ...makeInitialStateBase(hand, cpuHand, wall, wanpai),
      };
    }

    setHistory([newState]);
    setHistoryIndex(0);
    setDismissedIndex(-1);
  }, []);

  const playerDraw = useCallback(() => {
    setHistory(prev => {
      const cur = prev[historyIndex];
      const newState = cur ? applyPlayerDraw(cur) : null;
      return commitNewState(prev, historyIndex, newState);
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex, commitNewState]);

  const playerDiscard = useCallback((tile: Tile) => {
    if (isViewingPast) {
      const cur = history[historyIndex];
      const next = history[historyIndex + 1];
      if (cur && next && actionMatchesNext(cur, next, 'playerDiscard', tile)) {
        setHistoryIndex(prev => prev + 1);
        return;
      }
      setPendingAction({
        message: 'これ以降の牌譜は消去されますが、よろしいですか？',
        action: () => {
          setHistory(prev => {
            const c = prev[historyIndex];
            const newState = c ? applyPlayerDiscard(c, tile) : null;
            return commitNewState(prev, historyIndex, newState);
          });
          setHistoryIndex(prev => prev + 1);
        },
      });
      return;
    }
    setHistory(prev => {
      const cur = prev[historyIndex];
      const newState = cur ? applyPlayerDiscard(cur, tile) : null;
      return commitNewState(prev, historyIndex, newState);
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex, isViewingPast, history, commitNewState]);

  const cpuTurn = useCallback(() => {
    setHistory(prev => {
      const cur = prev[historyIndex];
      const newState = cur ? applyCpuTurn(cur) : null;
      return commitNewState(prev, historyIndex, newState);
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex, commitNewState]);

  useEffect(() => {
    if (isViewingPast) {
      if (!isStopState(state) && historyIndex < history.length - 1) {
        timeoutRef.current = setTimeout(() => {
          setHistoryIndex(prev => Math.min(prev + 1, history.length - 1));
        }, 400);
        return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
      }
      return;
    }
    if (state.phase === 'cpuTurn' && state.wall.length > 0) {
      timeoutRef.current = setTimeout(() => cpuTurn(), 700);
      return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
    }
    if (state.phase === 'playerDraw' && state.wall.length > 0) {
      timeoutRef.current = setTimeout(() => playerDraw(), 500);
      return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
    }
    if (state.phase === 'playerDiscard' && state.isRiichi && state.playerDrawnTile && !state.tsumoAvailable && !isViewingPast) {
      timeoutRef.current = setTimeout(() => playerDiscard(state.playerDrawnTile!), 700);
      return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
    }
  }, [state.phase, state.wall.length, state.isRiichi, state.playerDrawnTile, state.tsumoAvailable, state.playerHand, state.playerFuro, cpuTurn, playerDraw, playerDiscard, isViewingPast, historyIndex, history.length]);

  const callRon = useCallback(() => {
    if (isViewingPast) {
      const cur = history[historyIndex];
      const next = history[historyIndex + 1];
      if (cur && next && actionMatchesNext(cur, next, 'callRon')) {
        setHistoryIndex(prev => prev + 1);
        return;
      }
      setPendingAction({
        message: 'これ以降の牌譜は消去されますが、よろしいですか？',
        action: () => {
          setHistory(prev => {
            const c = prev[historyIndex];
            const newState = c ? applyCallRon(c) : null;
            return commitNewState(prev, historyIndex, newState);
          });
          setHistoryIndex(prev => prev + 1);
        },
      });
      return;
    }
    setHistory(prev => {
      const cur = prev[historyIndex];
      const newState = cur ? applyCallRon(cur) : null;
      return commitNewState(prev, historyIndex, newState);
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex, isViewingPast, history, commitNewState]);

  const callNaki = useCallback((option: NakiOption) => {
    if (isViewingPast) {
      const cur = history[historyIndex];
      const next = history[historyIndex + 1];
      if (cur && next && actionMatchesNext(cur, next, 'callNaki', undefined, option)) {
        setHistoryIndex(prev => prev + 1);
        return;
      }
      setPendingAction({
        message: 'これ以降の牌譜は消去されますが、よろしいですか？',
        action: () => {
          setHistory(prev => {
            const c = prev[historyIndex];
            const newState = c ? applyCallNaki(c, option) : null;
            return commitNewState(prev, historyIndex, newState);
          });
          setHistoryIndex(prev => prev + 1);
        },
      });
      return;
    }
    setHistory(prev => {
      const cur = prev[historyIndex];
      const newState = cur ? applyCallNaki(cur, option) : null;
      return commitNewState(prev, historyIndex, newState);
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex, isViewingPast, history, commitNewState]);

  const playerNakiDiscard = useCallback((tile: Tile) => {
    if (isViewingPast) {
      const cur = history[historyIndex];
      const next = history[historyIndex + 1];
      if (cur && next && actionMatchesNext(cur, next, 'playerNakiDiscard', tile)) {
        setHistoryIndex(prev => prev + 1);
        return;
      }
      setPendingAction({
        message: 'これ以降の牌譜は消去されますが、よろしいですか？',
        action: () => {
          setHistory(prev => {
            const c = prev[historyIndex];
            const newState = c ? applyPlayerNakiDiscard(c, tile) : null;
            return commitNewState(prev, historyIndex, newState);
          });
          setHistoryIndex(prev => prev + 1);
        },
      });
      return;
    }
    setHistory(prev => {
      const cur = prev[historyIndex];
      const newState = cur ? applyPlayerNakiDiscard(cur, tile) : null;
      return commitNewState(prev, historyIndex, newState);
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex, isViewingPast, history, commitNewState]);

  const passNaki = useCallback(() => {
    if (isViewingPast) {
      const cur = history[historyIndex];
      const next = history[historyIndex + 1];
      if (cur && next && actionMatchesNext(cur, next, 'passNaki')) {
        setHistoryIndex(prev => prev + 1);
        return;
      }
      setPendingAction({
        message: 'これ以降の牌譜は消去されますが、よろしいですか？',
        action: () => {
          setHistory(prev => {
            const c = prev[historyIndex];
            const newState = c ? applyPassNaki(c) : null;
            return commitNewState(prev, historyIndex, newState);
          });
          setHistoryIndex(prev => prev + 1);
        },
      });
      return;
    }
    setHistory(prev => {
      const cur = prev[historyIndex];
      const newState = cur ? applyPassNaki(cur) : null;
      return commitNewState(prev, historyIndex, newState);
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex, isViewingPast, history, commitNewState]);

  const passTsumo = useCallback(() => {
    if (isViewingPast) {
      const cur = history[historyIndex];
      const next = history[historyIndex + 1];
      if (cur && next && actionMatchesNext(cur, next, 'passTsumo')) {
        setHistoryIndex(prev => prev + 1);
        return;
      }
      setPendingAction({
        message: 'これ以降の牌譜は消去されますが、よろしいですか？',
        action: () => {
          setHistory(prev => {
            const c = prev[historyIndex];
            const newState = c ? applyPassTsumo(c) : null;
            return commitNewState(prev, historyIndex, newState);
          });
          setHistoryIndex(prev => prev + 1);
        },
      });
      return;
    }
    setHistory(prev => {
      const cur = prev[historyIndex];
      const newState = cur ? applyPassTsumo(cur) : null;
      return commitNewState(prev, historyIndex, newState);
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex, isViewingPast, history, commitNewState]);

  const declareTsumo = useCallback(() => {
    if (isViewingPast) {
      const cur = history[historyIndex];
      const next = history[historyIndex + 1];
      if (cur && next && actionMatchesNext(cur, next, 'declareTsumo')) {
        setHistoryIndex(prev => prev + 1);
        return;
      }
      setPendingAction({
        message: 'これ以降の牌譜は消去されますが、よろしいですか？',
        action: () => {
          setHistory(prev => {
            const c = prev[historyIndex];
            const newState = c ? applyDeclareTsumo(c) : null;
            return commitNewState(prev, historyIndex, newState);
          });
          setHistoryIndex(prev => prev + 1);
        },
      });
      return;
    }
    setHistory(prev => {
      const cur = prev[historyIndex];
      const newState = cur ? applyDeclareTsumo(cur) : null;
      return commitNewState(prev, historyIndex, newState);
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex, isViewingPast, history, commitNewState]);

  const declareKan = useCallback((option: NakiOption) => {
    if (isViewingPast) {
      setPendingAction({
        message: 'これ以降の牌譜は消去されますが、よろしいですか？',
        action: () => {
          setHistory(prev => {
            const cur = prev[historyIndex];
            const newState = cur ? applyDeclareKan(cur, option) : null;
            return commitNewState(prev, historyIndex, newState);
          });
          setHistoryIndex(prev => prev + 1);
        },
      });
      return;
    }
    setHistory(prev => {
      const cur = prev[historyIndex];
      const newState = cur ? applyDeclareKan(cur, option) : null;
      return commitNewState(prev, historyIndex, newState);
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex, isViewingPast, commitNewState]);

  const declareRiichi = useCallback(() => {
    if (isViewingPast) {
      setPendingAction({
        message: 'これ以降の牌譜は消去されますが、よろしいですか？',
        action: () => {
          setHistory(prev => {
            const c = prev[historyIndex];
            const newState = c ? applyDeclareRiichi(c) : null;
            return commitNewState(prev, historyIndex, newState);
          });
          setHistoryIndex(prev => prev + 1);
        },
      });
      return;
    }
    setHistory(prev => {
      const cur = prev[historyIndex];
      const newState = cur ? applyDeclareRiichi(cur) : null;
      return commitNewState(prev, historyIndex, newState);
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex, isViewingPast, commitNewState]);

  const riichiDiscard = useCallback((tile: Tile) => {
    if (isViewingPast) {
      const cur = history[historyIndex];
      const next = history[historyIndex + 1];
      if (cur && next && riichiDiscardMatchesNext(cur, next, tile)) {
        setHistoryIndex(prev => prev + 1);
        return;
      }
      setPendingAction({
        message: 'これ以降の牌譜は消去されますが、よろしいですか？',
        action: () => {
          setHistory(prev => {
            const c = prev[historyIndex];
            const newState = c ? applyRiichiDiscard(c, tile) : null;
            return commitNewState(prev, historyIndex, newState);
          });
          setHistoryIndex(prev => prev + 1);
        },
      });
      return;
    }
    setHistory(prev => {
      const cur = prev[historyIndex];
      const newState = cur ? applyRiichiDiscard(cur, tile) : null;
      return commitNewState(prev, historyIndex, newState);
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex, isViewingPast, history, commitNewState]);

  // "待った" — undo last move or commit rollback from past view
  const matta = useCallback(() => {
    if (historyIndex === 0) return;
    if (isViewingPast) {
      setPendingAction({
        message: 'この局面まで戻って打ち直しますか？（これ以降の牌譜は消去されます）',
        action: () => {
          setHistory(prev => prev.slice(0, historyIndex + 1));
          setDismissedIndex(-1);
        },
      });
      return;
    }
    const idx = findPrevStopIndex(history, historyIndex);
    setHistory(prev => prev.slice(0, idx + 1));
    setHistoryIndex(idx);
    setDismissedIndex(-1);
  }, [historyIndex, history, isViewingPast]);

  // "1手戻る" — navigate back to previous stop state for viewing
  const stepBack = useCallback(() => {
    if (historyIndex <= 0) return;
    setHistoryIndex(findPrevStopIndex(history, historyIndex));
  }, [historyIndex, history]);

  // "1手進む" — navigate forward to next stop state for viewing
  const stepForward = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    setHistoryIndex(findNextStopIndex(history, historyIndex));
  }, [historyIndex, history]);

  const confirmPendingAction = useCallback(() => {
    if (pendingAction) {
      pendingAction.action();
      setPendingAction(null);
    }
  }, [pendingAction]);

  const cancelPendingAction = useCallback(() => {
    setPendingAction(null);
  }, []);

  const { playerHand, playerDrawnTile, cpuHand, wall, fullWall, wallDrawnCount, wanpai, playerDiscards, cpuDiscards, playerFuro, phase, turnCount, lastCpuDiscard, nakiOptions, ronAvailable, winType, doraCount, isRiichi, tsumoAvailable } = state;

  const canTsumo = tsumoAvailable;
  const ankanOptions = playerDrawnTile ? findAnkanOptions(playerHand, playerDrawnTile) : [];
  const kakanOptions = playerDrawnTile ? findKakanOptions(playerHand, playerDrawnTile, playerFuro) : [];

  const isMenzen = isMenzenLogic(playerFuro);
  const canRiichi = !isRiichi && isMenzen && phase === 'playerDiscard' && !!playerDrawnTile && canRiichiLogic(playerHand, playerDrawnTile!, playerFuro);
  const riichiValidTiles = phase === 'riichiSelect' && playerDrawnTile ? validRiichiDiscards(playerHand, playerDrawnTile, playerFuro) : new Set<string>();
  const doraKeys = getDoraTileKeys(wanpai, doraCount);
  const isDora = (t: Tile) => doraKeys.has(`${t.suit}-${t.value}`);

  return (
    <div className="min-h-screen bg-[#1a2e1a] -col" style={{ fontFamily: "'Segoe UI', system-ui', sans-serif" }}>
      <Header
        turnCount={turnCount}
        maxDraws={MAX_DRAWS}
        wallCount={wall.length}
        isViewingPast={isViewingPast}
        historyIndex={historyIndex}
        historyLength={history.length}
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
        canStepForward={historyIndex < history.length - 1}
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
            onOk={() => setDismissedIndex(historyIndex)}
          />
        ) : (
          <GameOverOverlay
            title={winType === 'ron' ? 'ロン！' : 'ツモ！'}
            message="おめでとうございます — あがり！"
            onRestart={restart}
            onOk={() => setDismissedIndex(historyIndex)}
            isWin
          />
        );
      })()}
    </div>
  );
}
