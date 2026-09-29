import { useState, useCallback, useEffect, useRef } from 'react';
import { Tile, Phase, Furo } from '@/types';
import { createDeck, shuffle, sortHand, checkWinConcealed, canRonConcealed, findNakiOptions, findAnkanOptions, findKakanOptions, isMenzen as isMenzenLogic, canRiichi as canRiichiLogic, validRiichiDiscards, sameTile, getWaits, isFuriten, getDoraTileKeys, NakiOption } from '@/gameLogic';
import { State, makeInitialState, makeInitialStateBase } from '@/game/gameState';
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

const MAX_DRAWS = 18;

type PlayerAction = 'passNaki' | 'passTsumo' | 'callRon' | 'declareTsumo' | 'callNaki' | 'playerDiscard' | 'playerNakiDiscard';

function isStopState(s: State): boolean {
  return s.phase === 'playerDiscard' || s.phase === 'riichiSelect' || s.phase === 'naki' || s.phase === 'playerNakiDiscard' || s.phase === 'win' || s.phase === 'exhausted' || s.tsumoAvailable;
}

function actionMatchesNext(
  cur: State,
  next: State | undefined,
  action: PlayerAction,
  tile?: Tile,
  option?: NakiOption,
): boolean {
  if (!next) return false;
  switch (action) {
    case 'passNaki':
      return (next.phase === 'playerDraw' || next.phase === 'exhausted') && next.nakiOptions.length === 0 && !next.ronAvailable;
    case 'passTsumo':
      return next.phase === 'playerDiscard' && !next.tsumoAvailable;
    case 'callRon':
      return next.phase === 'win' && next.winType === 'ron';
    case 'declareTsumo':
      return next.phase === 'win' && next.winType === 'tsumo';
    case 'callNaki': {
      if (next.phase !== 'playerNakiDiscard' || next.playerFuro.length !== cur.playerFuro.length + 1) return false;
      const newFuro = next.playerFuro[next.playerFuro.length - 1];
      const expectedIds = new Set([...(option?.tiles ?? []), cur.lastCpuDiscard].filter(t => t).map(t => t!.id));
      const actualIds = new Set(newFuro.tiles.map(t => t.id));
      return expectedIds.size === actualIds.size && [...expectedIds].every(id => actualIds.has(id));
    }
    case 'playerDiscard':
    case 'playerNakiDiscard': {
      if (next.phase !== 'cpuTurn' && next.phase !== 'exhausted') return false;
      if (next.playerDiscards.length !== cur.playerDiscards.length + 1) return false;
      return next.playerDiscards[next.playerDiscards.length - 1]?.id === tile?.id;
    }
    default:
      return false;
  }
}

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
      if (!cur || cur.phase !== 'playerDraw' || cur.wall.length === 0) return prev;
      const [drawn, ...rest] = cur.wall;
      if (!drawn) return prev;
      const won = checkWinConcealed([...cur.playerHand, drawn], cur.playerFuro.length);
      const newState: State = {
        ...cur,
        playerDrawnTile: drawn,
        wall: rest,
        wallDrawnCount: cur.wallDrawnCount + 1,
        phase: 'playerDiscard',
        tsumoAvailable: won,
      };
      const truncated = prev.slice(0, historyIndex + 1);
      return [...truncated, newState];
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

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
            if (!c || c.phase !== 'playerDiscard' || !c.playerDrawnTile) return prev;
            let newHand: Tile[];
            if (tile.id === c.playerDrawnTile.id) {
              newHand = c.playerHand;
            } else {
              newHand = sortHand([...c.playerHand.filter(t => t.id !== tile.id), c.playerDrawnTile]);
            }
            const newDiscards = [...c.playerDiscards, tile];
            const newTurnCount = c.turnCount + 1;
            let newState: State;
            if (c.wall.length === 0 || newTurnCount >= MAX_DRAWS) {
              newState = { ...c, playerHand: newHand, playerDrawnTile: null, playerDiscards: newDiscards, phase: 'exhausted', turnCount: newTurnCount };
            } else {
              newState = { ...c, playerHand: newHand, playerDrawnTile: null, playerDiscards: newDiscards, phase: 'cpuTurn', turnCount: newTurnCount };
            }
            const truncated = prev.slice(0, historyIndex + 1);
            return [...truncated, newState];
          });
          setHistoryIndex(prev => prev + 1);
        },
      });
      return;
    }
    setHistory(prev => {
      const cur = prev[historyIndex];
      if (!cur || cur.phase !== 'playerDiscard' || !cur.playerDrawnTile) return prev;
      let newHand: Tile[];
      if (tile.id === cur.playerDrawnTile.id) {
        newHand = cur.playerHand;
      } else {
        newHand = sortHand([...cur.playerHand.filter(t => t.id !== tile.id), cur.playerDrawnTile]);
      }
      const newDiscards = [...cur.playerDiscards, tile];
      const newTurnCount = cur.turnCount + 1;
      let newState: State;
      if (cur.wall.length === 0 || newTurnCount >= MAX_DRAWS) {
        newState = { ...cur, playerHand: newHand, playerDrawnTile: null, playerDiscards: newDiscards, phase: 'exhausted', turnCount: newTurnCount };
      } else {
        newState = { ...cur, playerHand: newHand, playerDrawnTile: null, playerDiscards: newDiscards, phase: 'cpuTurn', turnCount: newTurnCount };
      }
      const truncated = prev.slice(0, historyIndex + 1);
      return [...truncated, newState];
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex, isViewingPast, history]);

  const cpuTurn = useCallback(() => {
    setHistory(prev => {
      const cur = prev[historyIndex];
      if (!cur || cur.phase !== 'cpuTurn' || cur.wall.length === 0) return prev;
      const [drawn, ...rest] = cur.wall;
      const cpuDiscard = drawn;
      const cpuAfterDiscard = cur.cpuHand;
      const newCpuDiscards = [...cur.cpuDiscards, cpuDiscard];

      const rawRon = canRonConcealed(cur.playerHand, cpuDiscard, cur.playerFuro.length);
      const furiten = isFuriten(getWaits(cur.playerHand, cur.playerFuro), cur.playerDiscards);
      const ron = rawRon && !furiten && !cur.missedRonAfterRiichi;
      const naki = cur.isRiichi ? [] : findNakiOptions(cur.playerHand, cpuDiscard);

      let newState: State;
      if (ron || naki.length > 0) {
        newState = {
          ...cur, cpuHand: cpuAfterDiscard, wall: rest, wallDrawnCount: cur.wallDrawnCount + 1,
          cpuDiscards: newCpuDiscards, phase: 'naki',
          lastCpuDiscard: cpuDiscard, nakiOptions: naki, ronAvailable: ron,
        };
      } else if (rest.length === 0) {
        newState = { ...cur, cpuHand: cpuAfterDiscard, wall: rest, wallDrawnCount: cur.wallDrawnCount + 1, cpuDiscards: newCpuDiscards, phase: 'exhausted' };
      } else {
        newState = { ...cur, cpuHand: cpuAfterDiscard, wall: rest, wallDrawnCount: cur.wallDrawnCount + 1, cpuDiscards: newCpuDiscards, phase: 'playerDraw' };
      }
      const truncated = prev.slice(0, historyIndex + 1);
      return [...truncated, newState];
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

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
            const cur = prev[historyIndex];
            if (!cur || cur.phase !== 'naki' || !cur.ronAvailable || !cur.lastCpuDiscard) return prev;
            const newState = { ...cur, phase: 'win' as Phase, winType: 'ron' as const };
            const truncated = prev.slice(0, historyIndex + 1);
            return [...truncated, newState];
          });
          setHistoryIndex(prev => prev + 1);
        },
      });
      return;
    }
    setHistory(prev => {
      const cur = prev[historyIndex];
      if (!cur || cur.phase !== 'naki' || !cur.ronAvailable || !cur.lastCpuDiscard) return prev;
      const newState = { ...cur, phase: 'win' as Phase, winType: 'ron' as const };
      const truncated = prev.slice(0, historyIndex + 1);
      return [...truncated, newState];
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex, isViewingPast, history]);

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
            const cur = prev[historyIndex];
            if (!cur || cur.phase !== 'naki' || !cur.lastCpuDiscard) return prev;
            const tilesToRemove = new Set(option.tiles.map(t => t.id));
            const newHand = sortHand(cur.playerHand.filter(t => !tilesToRemove.has(t.id)));
            const newFuro: Furo = {
              tiles: [...option.tiles, cur.lastCpuDiscard],
              type: option.type,
              calledTile: cur.lastCpuDiscard,
            };
            const newState = {
              ...cur, playerHand: newHand, playerFuro: [...cur.playerFuro, newFuro],
              phase: 'playerNakiDiscard' as Phase, nakiOptions: [], ronAvailable: false,
            };
            const truncated = prev.slice(0, historyIndex + 1);
            return [...truncated, newState];
          });
          setHistoryIndex(prev => prev + 1);
        },
      });
      return;
    }
    setHistory(prev => {
      const cur = prev[historyIndex];
      if (!cur || cur.phase !== 'naki' || !cur.lastCpuDiscard) return prev;
      const tilesToRemove = new Set(option.tiles.map(t => t.id));
      const newHand = sortHand(cur.playerHand.filter(t => !tilesToRemove.has(t.id)));
      const newFuro: Furo = {
        tiles: [...option.tiles, cur.lastCpuDiscard],
        type: option.type,
        calledTile: cur.lastCpuDiscard,
      };
      const newState = {
        ...cur, playerHand: newHand, playerFuro: [...cur.playerFuro, newFuro],
        phase: 'playerNakiDiscard' as Phase, nakiOptions: [], ronAvailable: false,
      };
      const truncated = prev.slice(0, historyIndex + 1);
      return [...truncated, newState];
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex, isViewingPast, history]);

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
            const cur = prev[historyIndex];
            if (!cur || cur.phase !== 'playerNakiDiscard') return prev;
            const newHand = sortHand(cur.playerHand.filter(t => t.id !== tile.id));
            const newDiscards = [...cur.playerDiscards, tile];
            let newState: State;
            if (cur.wall.length === 0) {
              newState = { ...cur, playerHand: newHand, playerDiscards: newDiscards, phase: 'exhausted' };
            } else {
              newState = { ...cur, playerHand: newHand, playerDiscards: newDiscards, phase: 'cpuTurn', lastCpuDiscard: null };
            }
            const truncated = prev.slice(0, historyIndex + 1);
            return [...truncated, newState];
          });
          setHistoryIndex(prev => prev + 1);
        },
      });
      return;
    }
    setHistory(prev => {
      const cur = prev[historyIndex];
      if (!cur || cur.phase !== 'playerNakiDiscard') return prev;
      const newHand = sortHand(cur.playerHand.filter(t => t.id !== tile.id));
      const newDiscards = [...cur.playerDiscards, tile];
      let newState: State;
      if (cur.wall.length === 0) {
        newState = { ...cur, playerHand: newHand, playerDiscards: newDiscards, phase: 'exhausted' };
      } else {
        newState = { ...cur, playerHand: newHand, playerDiscards: newDiscards, phase: 'cpuTurn', lastCpuDiscard: null };
      }
      const truncated = prev.slice(0, historyIndex + 1);
      return [...truncated, newState];
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex, isViewingPast, history]);

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
            const cur = prev[historyIndex];
            if (!cur || cur.phase !== 'naki') return prev;
            const missed = cur.isRiichi && cur.ronAvailable;
            let newState: State;
            if (cur.wall.length === 0) {
              newState = { ...cur, phase: 'exhausted', nakiOptions: [], ronAvailable: false, missedRonAfterRiichi: cur.missedRonAfterRiichi || missed };
            } else {
              newState = { ...cur, phase: 'playerDraw', nakiOptions: [], ronAvailable: false, lastCpuDiscard: null, missedRonAfterRiichi: cur.missedRonAfterRiichi || missed };
            }
            const truncated = prev.slice(0, historyIndex + 1);
            return [...truncated, newState];
          });
          setHistoryIndex(prev => prev + 1);
        },
      });
      return;
    }
    setHistory(prev => {
      const cur = prev[historyIndex];
      if (!cur || cur.phase !== 'naki') return prev;
      const missed = cur.isRiichi && cur.ronAvailable;
      let newState: State;
      if (cur.wall.length === 0) {
        newState = { ...cur, phase: 'exhausted', nakiOptions: [], ronAvailable: false, missedRonAfterRiichi: cur.missedRonAfterRiichi || missed };
      } else {
        newState = { ...cur, phase: 'playerDraw', nakiOptions: [], ronAvailable: false, lastCpuDiscard: null, missedRonAfterRiichi: cur.missedRonAfterRiichi || missed };
      }
      const truncated = prev.slice(0, historyIndex + 1);
      return [...truncated, newState];
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex, isViewingPast, history]);

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
            const cur = prev[historyIndex];
            if (!cur || !cur.tsumoAvailable) return prev;
            const newState: State = { ...cur, tsumoAvailable: false };
            const truncated = prev.slice(0, historyIndex + 1);
            return [...truncated, newState];
          });
          setHistoryIndex(prev => prev + 1);
        },
      });
      return;
    }
    setHistory(prev => {
      const cur = prev[historyIndex];
      if (!cur || !cur.tsumoAvailable) return prev;
      const newState: State = { ...cur, tsumoAvailable: false };
      const truncated = prev.slice(0, historyIndex + 1);
      return [...truncated, newState];
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex, isViewingPast, history]);

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
            const cur = prev[historyIndex];
            if (!cur || !cur.tsumoAvailable) return prev;
            const newState = { ...cur, phase: 'win' as Phase, winType: 'tsumo' as const, tsumoAvailable: false };
            const truncated = prev.slice(0, historyIndex + 1);
            return [...truncated, newState];
          });
          setHistoryIndex(prev => prev + 1);
        },
      });
      return;
    }
    setHistory(prev => {
      const cur = prev[historyIndex];
      if (!cur || !cur.tsumoAvailable) return prev;
      const newState = { ...cur, phase: 'win' as Phase, winType: 'tsumo' as const, tsumoAvailable: false };
      const truncated = prev.slice(0, historyIndex + 1);
      return [...truncated, newState];
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex, isViewingPast, history]);

  const declareKan = useCallback((option: NakiOption) => {
    const executeKan = (cur: State): State | null => {
      const tilesToRemove = new Set(option.tiles.map(t => t.id));
      const isAnkan = option.type === 'ankan';
      const isKakan = option.type === 'kakan';
      const isDaiminkan = option.type === 'daiminkan';

      let newHand: Tile[];
      let newFuroList: Furo[];

      if (isKakan) {
        // 加槓: find the pung furo to upgrade, remove the 4th tile from hand/drawn
        const kakanTile = option.tiles[0];
        const targetKey = `${kakanTile.suit}-${kakanTile.value}`;
        const pungIdx = cur.playerFuro.findIndex(f => f.type === 'pung' && sameTile(f.tiles[0], kakanTile));
        if (pungIdx === -1) return null;
        const pungFuro = cur.playerFuro[pungIdx];
        const upgradedFuro: Furo = {
          tiles: [...pungFuro.tiles, kakanTile],
          type: 'kakan',
          calledTile: pungFuro.calledTile,
        };
        newFuroList = [...cur.playerFuro];
        newFuroList[pungIdx] = upgradedFuro;
        // Remove the kakan tile from hand or drawn
        if (cur.playerDrawnTile && kakanTile.id === cur.playerDrawnTile.id) {
          newHand = cur.playerHand;
        } else {
          newHand = sortHand(cur.playerHand.filter(t => t.id !== kakanTile.id));
        }
      } else if (isAnkan) {
        newHand = sortHand(cur.playerHand.filter(t => !tilesToRemove.has(t.id)));
        const newFuro: Furo = {
          tiles: option.tiles,
          type: 'ankan',
          calledTile: option.tiles[0],
        };
        newFuroList = [...cur.playerFuro, newFuro];
      } else if (isDaiminkan) {
        newHand = sortHand(cur.playerHand.filter(t => !tilesToRemove.has(t.id)));
        const newFuro: Furo = {
          tiles: [...option.tiles, cur.lastCpuDiscard!],
          type: 'daiminkan',
          calledTile: cur.lastCpuDiscard!,
        };
        newFuroList = [...cur.playerFuro, newFuro];
      } else {
        // Legacy 'kan' type (shouldn't occur anymore, but handle gracefully)
        newHand = sortHand(cur.playerHand.filter(t => !tilesToRemove.has(t.id)));
        const newFuro: Furo = {
          tiles: option.tiles,
          type: 'kan',
          calledTile: cur.lastCpuDiscard ?? option.tiles[0],
        };
        newFuroList = [...cur.playerFuro, newFuro];
      }

      // 嶺上ツモ: take from wanpai[0] (rinshan tiles)
      const [rinshan, ...restWanpai] = cur.wanpai;
      if (!rinshan) return null;

      // 王牌補充: move last tile from wall to end of wanpai
      let newWall = cur.wall;
      let newWanpai = restWanpai;
      if (cur.wall.length > 0) {
        const supplement = cur.wall[cur.wall.length - 1];
        newWall = cur.wall.slice(0, -1);
        // 1. 嶺上牌（index 0）を1枚消費した残りの嶺上牌3枚（index 0..2）
        const remainingRinshan = restWanpai.slice(0, 3);
        // 2. ドラ・裏ドラ群（index 3 以降の10枚）
        const doraAndUraDora = restWanpai.slice(3);        
        // 3. 嶺上牌の最後尾（3枚目とドラ表示牌の間）に supplement を挟み込んで14枚に戻す
        newWanpai = [...remainingRinshan, supplement, ...doraAndUraDora];
      }

      // カンドラ開帳
      const newDoraCount = cur.doraCount + 1;

      // ツモアガリ判定
      const won = checkWinConcealed([...newHand, rinshan], newFuroList.length);

      const newState: State = {
        ...cur,
        playerHand: newHand,
        playerFuro: newFuroList,
        playerDrawnTile: rinshan,
        wall: newWall,
        wanpai: newWanpai,
        doraCount: newDoraCount,
        phase: 'playerDiscard',
        tsumoAvailable: won,
        nakiOptions: [],
        ronAvailable: false,
        lastCpuDiscard: null,
      };
      return newState;
    };

    if (isViewingPast) {
      setPendingAction({
        message: 'これ以降の牌譜は消去されますが、よろしいですか？',
        action: () => {
          setHistory(prev => {
            const cur = prev[historyIndex];
            if (!cur) return prev;
            const newState = executeKan(cur);
            if (!newState) return prev;
            const truncated = prev.slice(0, historyIndex + 1);
            return [...truncated, newState];
          });
          setHistoryIndex(prev => prev + 1);
        },
      });
      return;
    }
    setHistory(prev => {
      const cur = prev[historyIndex];
      if (!cur) return prev;
      const newState = executeKan(cur);
      if (!newState) return prev;
      const truncated = prev.slice(0, historyIndex + 1);
      return [...truncated, newState];
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex, isViewingPast]);

  const declareRiichi = useCallback(() => {
    if (isViewingPast) {
      setPendingAction({
        message: 'これ以降の牌譜は消去されますが、よろしいですか？',
        action: () => {
          setHistory(prev => {
            const cur = prev[historyIndex];
            if (!cur || cur.phase !== 'playerDiscard') return prev;
            const newState: State = { ...cur, phase: 'riichiSelect' as Phase };
            const truncated = prev.slice(0, historyIndex + 1);
            return [...truncated, newState];
          });
          setHistoryIndex(prev => prev + 1);
        },
      });
      return;
    }
    setHistory(prev => {
      const cur = prev[historyIndex];
      if (!cur || cur.phase !== 'playerDiscard') return prev;
      const newState: State = { ...cur, phase: 'riichiSelect' as Phase };
      const truncated = prev.slice(0, historyIndex + 1);
      return [...truncated, newState];
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex, isViewingPast]);

  const riichiDiscard = useCallback((tile: Tile) => {
    if (isViewingPast) {
      const cur = history[historyIndex];
      const next = history[historyIndex + 1];
      if (cur && next && next.phase === 'cpuTurn' && next.isRiichi === true && next.playerDiscards.length === cur.playerDiscards.length + 1 && next.playerDiscards[next.playerDiscards.length - 1]?.id === tile.id) {
        setHistoryIndex(prev => prev + 1);
        return;
      }
      setPendingAction({
        message: 'これ以降の牌譜は消去されますが、よろしいですか？',
        action: () => {
          setHistory(prev => {
            const cur = prev[historyIndex];
            if (!cur || cur.phase !== 'riichiSelect' || !cur.playerDrawnTile) return prev;
            let newHand: Tile[];
            if (tile.id === cur.playerDrawnTile.id) {
              newHand = cur.playerHand;
            } else {
              newHand = sortHand([...cur.playerHand.filter(t => t.id !== tile.id), cur.playerDrawnTile]);
            }
            const newDiscards = [...cur.playerDiscards, tile];
            const newTurnCount = cur.turnCount + 1;
            let newState: State;
            if (cur.wall.length === 0 || newTurnCount >= MAX_DRAWS) {
              newState = { ...cur, playerHand: newHand, playerDrawnTile: null, playerDiscards: newDiscards, phase: 'exhausted', turnCount: newTurnCount, isRiichi: true };
            } else {
              newState = { ...cur, playerHand: newHand, playerDrawnTile: null, playerDiscards: newDiscards, phase: 'cpuTurn', turnCount: newTurnCount, isRiichi: true };
            }
            const truncated = prev.slice(0, historyIndex + 1);
            return [...truncated, newState];
          });
          setHistoryIndex(prev => prev + 1);
        },
      });
      return;
    }
    setHistory(prev => {
      const cur = prev[historyIndex];
      if (!cur || cur.phase !== 'riichiSelect' || !cur.playerDrawnTile) return prev;
      let newHand: Tile[];
      if (tile.id === cur.playerDrawnTile.id) {
        newHand = cur.playerHand;
      } else {
        newHand = sortHand([...cur.playerHand.filter(t => t.id !== tile.id), cur.playerDrawnTile]);
      }
      const newDiscards = [...cur.playerDiscards, tile];
      const newTurnCount = cur.turnCount + 1;
      let newState: State;
      if (cur.wall.length === 0 || newTurnCount >= MAX_DRAWS) {
        newState = { ...cur, playerHand: newHand, playerDrawnTile: null, playerDiscards: newDiscards, phase: 'exhausted', turnCount: newTurnCount, isRiichi: true };
      } else {
        newState = { ...cur, playerHand: newHand, playerDrawnTile: null, playerDiscards: newDiscards, phase: 'cpuTurn', turnCount: newTurnCount, isRiichi: true };
      }
      const truncated = prev.slice(0, historyIndex + 1);
      return [...truncated, newState];
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex, isViewingPast, history]);

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
    // Latest step: go back to previous stop state, no popup
    let idx = historyIndex - 1;
    while (idx > 0 && !isStopState(history[idx])) idx--;
    setHistory(prev => prev.slice(0, idx + 1));
    setHistoryIndex(idx);
    setDismissedIndex(-1);
  }, [historyIndex, history, isViewingPast]);

  // "1手戻る" — navigate back to previous stop state for viewing
  const stepBack = useCallback(() => {
    if (historyIndex <= 0) return;
    let idx = historyIndex - 1;
    while (idx > 0 && !isStopState(history[idx])) idx--;
    setHistoryIndex(Math.max(0, idx));
  }, [historyIndex, history]);

  // "1手進む" — navigate forward to next stop state for viewing
  const stepForward = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    let idx = historyIndex + 1;
    while (idx < history.length - 1 && !isStopState(history[idx])) idx++;
    setHistoryIndex(Math.min(history.length - 1, idx));
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


