import { describe, expect, it } from 'vitest';
import { searchBestWin } from '@/game/solver';
import { makeInitialStateBase } from '@/game/gameState';
import type { Tile } from '@/types';

function tile(id: string, suit: Tile['suit'], value: number): Tile {
  return { id, suit, value };
}

describe('searchBestWin', () => {
  it('returns a completed no-solution result when the wall is empty before drawing', () => {
    const hand = [
      tile('1', 'man', 1), tile('2', 'man', 2), tile('3', 'man', 3),
      tile('4', 'pin', 1), tile('5', 'pin', 2), tile('6', 'pin', 3),
      tile('7', 'sou', 1), tile('8', 'sou', 2), tile('9', 'sou', 3),
      tile('10', 'wind', 1), tile('11', 'wind', 2), tile('12', 'dragon', 1),
      tile('13', 'dragon', 2),
    ];
    const state = makeInitialStateBase(hand, [], [], []);

    const result = searchBestWin(state);

    expect(result.complete).toBe(true);
    expect(result.bestScore).toBeNull();
    expect(result.line).toEqual([]);
    expect(result.stats.statesVisited).toBeGreaterThan(0);
  });

  it('does not claim an optimum when the safety state limit prevents search', () => {
    const state = makeInitialStateBase([], [], [tile('draw', 'man', 1)], []);

    const result = searchBestWin(state, { maxStates: 0 });

    expect(result.complete).toBe(false);
    expect(result.bestScore).toBeNull();
    expect(result.line).toEqual([]);
  });
});
