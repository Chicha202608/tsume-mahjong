import { useState, useCallback, useEffect, useRef } from 'react';
import { Tile, Furo } from '@/types';
import {
  createDeck,
  shuffle,
  sortHand,
  findAnkanOptions,
  findKakanOptions,
  isMenzen as isMenzenLogic,
  canRiichi as canRiichiLogic,
  validRiichiDiscards,
  getDoraTileKeys,
  NakiOption,
} from '@/gameLogic';
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

const CONFIRM_MESSAGE = 'これ以降の牌譜は消去されますが、よろしいですか？';
const MATTACONFIRM_MESSAGE = 'この局面まで戻って打ち直しますか？（これ以降の牌譜は消去されます）';

export interface GameEngine {
  state: State;
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
  setupTestState: (mode: 'ankan' | 'kakan' | 'daiminkan') => void;
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
    setHistory([makeInitialState()]);
    setHistoryIndex(0);
    setDismissedIndex(-1);
  }, [clearTimer]);

  const setupTestState = useCallback((mode: 'ankan' | 'kakan' | 'daiminkan') => {
    clearTimer();

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
  }, [clearTimer]);

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
    if (isViewingPast) {
      setPendingAction({
        message: MATTACONFIRM_MESSAGE,
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
      timeoutRef.current = setTimeout(() => cpuTurn(), 700);
      return () => { clearTimer(); };
    }
    if (state.phase === 'playerDraw' && state.wall.length > 0) {
      timeoutRef.current = setTimeout(() => playerDraw(), 500);
      return () => { clearTimer(); };
    }
    if (state.phase === 'playerDiscard' && state.isRiichi && state.playerDrawnTile && !state.tsumoAvailable && !isViewingPast) {
      timeoutRef.current = setTimeout(() => playerDiscard(state.playerDrawnTile!), 700);
      return () => { clearTimer(); };
    }
  }, [state.phase, state.wall.length, state.isRiichi, state.playerDrawnTile, state.tsumoAvailable, state.playerHand, state.playerFuro, cpuTurn, playerDraw, playerDiscard, isViewingPast, historyIndex, history.length, clearTimer]);

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
  const ankanOptions = playerDrawnTile ? findAnkanOptions(playerHand, playerDrawnTile) : [];
  const kakanOptions = playerDrawnTile ? findKakanOptions(playerHand, playerDrawnTile, playerFuro) : [];

  const isMenzen = isMenzenLogic(playerFuro);
  const canRiichi = !isRiichi && isMenzen && phase === 'playerDiscard' && !!playerDrawnTile && canRiichiLogic(playerHand, playerDrawnTile!, playerFuro);
  const riichiValidTiles = phase === 'riichiSelect' && playerDrawnTile ? validRiichiDiscards(playerHand, playerDrawnTile, playerFuro) : new Set<string>();
  const doraKeys = getDoraTileKeys(wanpai, doraCount);
  const isDora = (t: Tile) => doraKeys.has(`${t.suit}-${t.value}`);

  return {
    state,
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
