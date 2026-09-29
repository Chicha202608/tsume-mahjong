import { Tile } from '@/types';
import { NakiOption } from '@/gameLogic';
import { State } from '@/game/gameState';

export type PlayerAction = 'passNaki' | 'passTsumo' | 'callRon' | 'declareTsumo' | 'callNaki' | 'playerDiscard' | 'playerNakiDiscard';

export function isStopState(s: State): boolean {
  return s.phase === 'playerDiscard' || s.phase === 'riichiSelect' || s.phase === 'naki' || s.phase === 'playerNakiDiscard' || s.phase === 'win' || s.phase === 'exhausted' || s.tsumoAvailable;
}

export function actionMatchesNext(
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

export function commitNewState(prev: State[], idx: number, newState: State | null): State[] {
  if (!newState) return prev;
  const truncated = prev.slice(0, idx + 1);
  return [...truncated, newState];
}

export function findPrevStopIndex(history: State[], fromIndex: number): number {
  let idx = fromIndex - 1;
  while (idx > 0 && !isStopState(history[idx])) idx--;
  return Math.max(0, idx);
}

export function findNextStopIndex(history: State[], fromIndex: number): number {
  const max = history.length - 1;
  if (fromIndex >= max) return max;
  let idx = fromIndex + 1;
  while (idx < max && !isStopState(history[idx])) idx++;
  return Math.min(max, idx);
}

export function riichiDiscardMatchesNext(cur: State, next: State | undefined, tile: Tile): boolean {
  if (!next) return false;
  return next.phase === 'cpuTurn' && next.isRiichi === true && next.playerDiscards.length === cur.playerDiscards.length + 1 && next.playerDiscards[next.playerDiscards.length - 1]?.id === tile.id;
}
