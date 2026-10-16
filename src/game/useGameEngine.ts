import { useState, useCallback, useEffect, useRef } from 'react';
import { Tile } from '@/types';
import {
  findLegalAnkanOptions,
  findKakanOptions,
  isMenzen as isMenzenLogic,
  canRiichi as canRiichiLogic,
  validRiichiDiscards,
  getDoraTileKeys,
  NakiOption,
} from '@/gameLogic';
import { State, makeInitialState, type GameMode } from '@/game/gameState';
import { hasFuturePlayerDraw } from '@/game/seatFlow';
import { asFourPlayerTestState } from '@/game/testScenarios';
import { makeKanTestState, makeRiichiAnkanTestState, makeOpenIttsuRonTestState, makeOpenIttsuTsumoTestState, makeTwoAnkanTestState, type TestMode } from '@/game/testScenarios';
import {
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
  findMattaIndex,
  findNextStopIndex,
  riichiDiscardMatchesNext,
} from '@/game/history';

const CONFIRM_MESSAGE = 'これ以降の牌譜は消去されますが、よろしいですか？';
const MATTACONFIRM_MESSAGE = 'この局面まで戻って打ち直しますか？（これ以降の牌譜は消去されます）';

export interface GameEngine {
  state: State;
  initialState: State;
  isViewingPast: boolean;
  canUndo: boolean;
  canStepForward: boolean;
  historyIndex: number;
  historyLength: number;
  pendingAction: { message: string } | null;
  confirmPendingAction: () => void;
  cancelPendingAction: () => void;
  dismissedIndex: number;
  dismissGameOver: () => void;
  canTsumo: boolean;
  ankanOptions: NakiOption[];
  kakanOptions: NakiOption[];
  canRiichi: boolean;
  riichiValidTiles: Set<string>;
  isDora: (t: Tile) => boolean;
  restart: () => void;
  setMode: (mode: GameMode) => void;
  setupTestState: (mode: TestMode) => void;
  playerDiscard: (tile: Tile) => void;
  playerNakiDiscard: (tile: Tile) => void;
  riichiDiscard: (tile: Tile) => void;
  callRon: () => void;
  callNaki: (option: NakiOption) => void;
  passNaki: () => void;
  passTsumo: () => void;
  declareTsumo: () => void;
  declareKan: (option: NakiOption) => void;
  declareRiichi: () => void;
  matta: () => void;
  stepBack: () => void;
  stepForward: () => void;
}

export function useGameEngine(): GameEngine {
  const [history, setHistory] = useState<State[]>(() => [makeInitialState()]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [pendingAction, setPendingAction] = useState<{ action: () => void; message: string } | null>(null);
  const [dismissedIndex, setDismissedIndex] = useState(-1);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const state = history[historyIndex] ?? history[0] ?? makeInitialState();
  const isViewingPast = historyIndex < history.length - 1;
  const canUndo = historyIndex > 1;
  const canStepForward = historyIndex < history.length - 1;

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const restart = useCallback(() => {
    clearTimer();
    setHistory([makeInitialState(state.mode)]);
    setHistoryIndex(0);
    setDismissedIndex(-1);
  }, [clearTimer, state.mode]);

  const setMode = useCallback((mode: GameMode) => {
    clearTimer();
    setPendingAction(null);
    setHistory([makeInitialState(mode)]);
    setHistoryIndex(0);
    setDismissedIndex(-1);
  }, [clearTimer]);

  const setupTestState = useCallback((mode: TestMode) => {
    clearTimer();
    const prepare = (test: State) => state.mode === 'four' ? asFourPlayerTestState(test) : test;
    if (mode === 'two-ankan' || mode === 'chained-ankan') {
      setHistory([prepare(makeTwoAnkanTestState(mode === 'chained-ankan'))]);
      setHistoryIndex(0);
      setDismissedIndex(-1);
      return;
    }
    if (mode === 'riichi-ankan') {
      setHistory([prepare(makeRiichiAnkanTestState())]);
      setHistoryIndex(0);
      setDismissedIndex(-1);
      return;
    }
    if (mode === 'open-ittsu-ron') {
      setHistory([prepare(makeOpenIttsuRonTestState())]);
      setHistoryIndex(0);
      setDismissedIndex(-1);
      return;
    }
    if (mode === 'open-ittsu-tsumo') {
      setHistory([prepare(makeOpenIttsuTsumoTestState())]);
      setHistoryIndex(0);
      setDismissedIndex(-1);
      return;
    }

    const newState = makeKanTestState(mode);

    setHistory([prepare(newState)]);
    setHistoryIndex(0);
    setDismissedIndex(-1);
  }, [clearTimer, state.mode]);

  // --- Internal callbacks (not exposed to UI) ---

  const playerDraw = useCallback(() => {
    setHistory(prev => {
      const cur = prev[historyIndex];
      const newState = cur ? applyPlayerDraw(cur) : null;
      return commitNewState(prev, historyIndex, newState);
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

  const cpuTurn = useCallback(() => {
    setHistory(prev => {
      const cur = prev[historyIndex];
      const newState = cur ? applyCpuTurn(cur) : null;
      return commitNewState(prev, historyIndex, newState);
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

  // --- performAction: common pattern for player callbacks ---
  //
  // applyFn:  transitions function that produces the next state
  // matchFn:  replay check — if viewing past and next history entry matches,
  //           advance index instead of creating new history. null = always confirm.
  // message:  confirmation dialog text when branching from recorded history
  const performAction = useCallback(
    (
      applyFn: (cur: State) => State | null,
      matchFn: ((cur: State, next: State) => boolean) | null,
      message: string,
    ) => {
      if (isViewingPast && matchFn) {
        const cur = history[historyIndex];
        const next = history[historyIndex + 1];
        if (cur && next && matchFn(cur, next)) {
          setHistoryIndex(prev => prev + 1);
          return;
        }
      }
      if (isViewingPast) {
        setPendingAction({
          message,
          action: () => {
            setHistory(prev => {
              const c = prev[historyIndex];
              const newState = c ? applyFn(c) : null;
              return commitNewState(prev, historyIndex, newState);
            });
            setHistoryIndex(prev => prev + 1);
          },
        });
        return;
      }
      setHistory(prev => {
        const cur = prev[historyIndex];
        const newState = cur ? applyFn(cur) : null;
        return commitNewState(prev, historyIndex, newState);
      });
      setHistoryIndex(prev => prev + 1);
    },
    [historyIndex, isViewingPast, history],
  );

  // --- Player action callbacks (exposed to UI) ---

  const playerDiscard = useCallback((tile: Tile) => {
    performAction(
      (cur) => applyPlayerDiscard(cur, tile),
      (cur, next) => actionMatchesNext(cur, next, 'playerDiscard', tile),
      CONFIRM_MESSAGE,
    );
  }, [performAction]);

  const playerNakiDiscard = useCallback((tile: Tile) => {
    performAction(
      (cur) => applyPlayerNakiDiscard(cur, tile),
      (cur, next) => actionMatchesNext(cur, next, 'playerNakiDiscard', tile),
      CONFIRM_MESSAGE,
    );
  }, [performAction]);

  const riichiDiscard = useCallback((tile: Tile) => {
    performAction(
      (cur) => applyRiichiDiscard(cur, tile),
      (cur, next) => riichiDiscardMatchesNext(cur, next, tile),
      CONFIRM_MESSAGE,
    );
  }, [performAction]);

  const callRon = useCallback(() => {
    performAction(
      (cur) => applyCallRon(cur),
      (cur, next) => actionMatchesNext(cur, next, 'callRon'),
      CONFIRM_MESSAGE,
    );
  }, [performAction]);

  const callNaki = useCallback((option: NakiOption) => {
    performAction(
      (cur) => applyCallNaki(cur, option),
      (cur, next) => actionMatchesNext(cur, next, 'callNaki', undefined, option),
      CONFIRM_MESSAGE,
    );
  }, [performAction]);

  const passNaki = useCallback(() => {
    performAction(
      (cur) => applyPassNaki(cur),
      (cur, next) => actionMatchesNext(cur, next, 'passNaki'),
      CONFIRM_MESSAGE,
    );
  }, [performAction]);

  const passTsumo = useCallback(() => {
    performAction(
      (cur) => applyPassTsumo(cur),
      (cur, next) => actionMatchesNext(cur, next, 'passTsumo'),
      CONFIRM_MESSAGE,
    );
  }, [performAction]);

  const declareTsumo = useCallback(() => {
    performAction(
      (cur) => applyDeclareTsumo(cur),
      (cur, next) => actionMatchesNext(cur, next, 'declareTsumo'),
      CONFIRM_MESSAGE,
    );
  }, [performAction]);

  const declareKan = useCallback((option: NakiOption) => {
    performAction(
      (cur) => applyDeclareKan(cur, option),
      null,
      CONFIRM_MESSAGE,
    );
  }, [performAction]);

  const declareRiichi = useCallback(() => {
    performAction(
      (cur) => applyDeclareRiichi(cur),
      null,
      CONFIRM_MESSAGE,
    );
  }, [performAction]);

  // --- History navigation callbacks ---

  const matta = useCallback(() => {
    if (historyIndex === 0) return;
    const idx = findMattaIndex(history, historyIndex);
    const rewind = (target: number) => {
      clearTimer();
      setHistory(prev => prev.slice(0, target + 1));
      setHistoryIndex(target);
      setDismissedIndex(-1);
    };
    if (isViewingPast) {
      const target = history[historyIndex].isRiichi && history[idx]?.phase === 'riichiSelect' ? idx : historyIndex;
      setPendingAction({
        message: history[target]?.phase === 'riichiSelect'
          ? 'リーチ宣言牌の選択まで戻って打ち直しますか？（これ以降の牌譜は消去されます）'
          : MATTACONFIRM_MESSAGE,
        action: () => rewind(target),
      });
      return;
    }
    rewind(idx);
  }, [historyIndex, history, isViewingPast, clearTimer]);

  const stepBack = useCallback(() => {
    if (historyIndex <= 0) return;
    setHistoryIndex(findPrevStopIndex(history, historyIndex));
  }, [historyIndex, history]);

  const stepForward = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    setHistoryIndex(findNextStopIndex(history, historyIndex));
  }, [historyIndex, history]);

  // --- Pending action dialog callbacks ---

  const confirmPendingAction = useCallback(() => {
    setPendingAction(prev => {
      if (prev) prev.action();
      return null;
    });
  }, []);

  const cancelPendingAction = useCallback(() => {
    setPendingAction(null);
  }, []);

  const dismissGameOver = useCallback(() => {
    setDismissedIndex(historyIndex);
  }, [historyIndex]);

  // --- Auto-advance effect ---

  useEffect(() => {
    if (isViewingPast) {
      if (!isStopState(state) && historyIndex < history.length - 1) {
        timeoutRef.current = setTimeout(() => {
          setHistoryIndex(prev => Math.min(prev + 1, history.length - 1));
        }, 400);
        return () => { clearTimer(); };
      }
      return;
    }
    if (state.phase === 'cpuTurn' && state.wall.length > 0) {
      timeoutRef.current = setTimeout(() => cpuTurn(), state.mode === 'four' ? 400 : 700);
      return () => { clearTimer(); };
    }
    if (state.phase === 'playerDraw' && state.wall.length > 0) {
      timeoutRef.current = setTimeout(() => playerDraw(), 500);
      return () => { clearTimer(); };
    }
    if (state.phase === 'playerDiscard' && state.isRiichi && state.playerDrawnTile && !state.tsumoAvailable && !isViewingPast &&
        findLegalAnkanOptions(state.playerHand, state.playerDrawnTile, state.playerFuro, true).length === 0) {
      timeoutRef.current = setTimeout(() => playerDiscard(state.playerDrawnTile!), 700);
      return () => { clearTimer(); };
    }
  }, [state, cpuTurn, playerDraw, playerDiscard, isViewingPast, historyIndex, history.length, clearTimer]);

  // --- Derived values ---

  const {
    playerHand,
    playerDrawnTile,
    playerFuro,
    wanpai,
    doraCount,
    phase,
    tsumoAvailable,
    isRiichi,
  } = state;

  const canTsumo = tsumoAvailable;
  const kanAllowed = state.wall.length > 0 && doraCount < 5 && wanpai.length >= 14;
  const ankanOptions = kanAllowed ? findLegalAnkanOptions(playerHand, playerDrawnTile, playerFuro, isRiichi) : [];
  const kakanOptions = kanAllowed && !isRiichi && playerDrawnTile ? findKakanOptions(playerHand, playerDrawnTile, playerFuro) : [];

  const isMenzen = isMenzenLogic(playerFuro);
  const canRiichi = !isRiichi && isMenzen && phase === 'playerDiscard' && !!playerDrawnTile &&
    (state.mode !== 'four' || hasFuturePlayerDraw(state)) && canRiichiLogic(playerHand, playerDrawnTile!, playerFuro);
  const riichiValidTiles = phase === 'riichiSelect' && playerDrawnTile ? validRiichiDiscards(playerHand, playerDrawnTile, playerFuro) : new Set<string>();
  const doraKeys = getDoraTileKeys(wanpai, doraCount);
  const isDora = (t: Tile) => doraKeys.has(`${t.suit}-${t.value}`);

  return {
    state,
    initialState: history[0],
    isViewingPast,
    canUndo,
    canStepForward,
    historyIndex,
    historyLength: history.length,
    pendingAction: pendingAction ? { message: pendingAction.message } : null,
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
  };
}
