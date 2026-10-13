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

  it('finds a known one-draw tsumo line and reports the winning score', () => {
    const hand = [
      tile('m1', 'man', 1), tile('m2', 'man', 2), tile('m3', 'man', 3),
      tile('p1', 'pin', 1), tile('p2', 'pin', 2), tile('p3', 'pin', 3),
      tile('s1', 'sou', 1), tile('s2', 'sou', 2), tile('s3', 'sou', 3),
      tile('s7', 'sou', 7), tile('s8', 'sou', 8),
      tile('w1', 'wind', 1), tile('w2', 'wind', 1),
    ];
    const winningTile = tile('s6', 'sou', 6);
    const state = makeInitialStateBase(hand, [], [winningTile], []);

    const result = searchBestWin(state);

    expect(result.complete).toBe(true);
    expect(result.bestScore).toBeGreaterThan(0);
    expect(result.line.map((action) => action.type)).toEqual(['draw', 'tsumo']);
    // The initial deal has no prior discard on which riichi could be declared.
    const winningAction = result.line[result.line.length - 1];
    expect(winningAction).toMatchObject({ type: 'tsumo', riichi: false });
  });

  it('considers last-moment riichi when a prior discard opportunity exists', () => {
    const hand = [
      tile('m1', 'man', 1), tile('m2', 'man', 2), tile('m3', 'man', 3),
      tile('p1', 'pin', 1), tile('p2', 'pin', 2), tile('p3', 'pin', 3),
      tile('s1', 'sou', 1), tile('s2', 'sou', 2), tile('s3', 'sou', 3),
      tile('s7', 'sou', 7), tile('s8', 'sou', 8),
      tile('w1', 'wind', 1), tile('w2', 'wind', 1),
    ];
    const winningTile = tile('s6', 'sou', 6);
    const state = {
      ...makeInitialStateBase(hand, [], [winningTile], []),
      turnCount: 1,
    };

    const result = searchBestWin(state);

    expect(result.complete).toBe(true);
    const winningAction = result.line[result.line.length - 1];
    expect(winningAction).toMatchObject({ type: 'tsumo', riichi: true });
  });

  it('finds a no-yaku ron made legal by last-moment riichi', () => {
    const hand = [
      tile('m1', 'man', 1), tile('m2', 'man', 2), tile('m3', 'man', 3),
      tile('m4', 'man', 4), tile('m5', 'man', 5), tile('m6', 'man', 6),
      tile('p1', 'pin', 1), tile('p2', 'pin', 2), tile('p3', 'pin', 3),
      tile('s7', 'sou', 7), tile('s9', 'sou', 9),
      tile('w3a', 'wind', 3), tile('w3b', 'wind', 3),
    ];
    const winningTile = tile('s8', 'sou', 8);
    const state = {
      ...makeInitialStateBase(hand, [], [winningTile], []),
      phase: 'cpuTurn' as const,
      turnCount: 1,
      roundWind: 'east' as const,
      playerWind: 'south' as const,
    };

    const result = searchBestWin(state);

    expect(result.complete).toBe(true);
    expect(result.line.map((action) => action.type)).toEqual(['cpu-turn', 'ron']);
    const winningAction = result.line[result.line.length - 1];
    expect(winningAction).toMatchObject({ type: 'ron', tile: winningTile, riichi: true, lastMomentRiichi: true });
    expect(result.bestScore).toBeGreaterThan(0);
  });

  it('marks the discard where last-moment riichi should be declared', () => {
    const hand = [
      tile('m1', 'man', 1), tile('m2', 'man', 2), tile('m3', 'man', 3),
      tile('m4', 'man', 4), tile('m5', 'man', 5), tile('m6', 'man', 6),
      tile('p1', 'pin', 1), tile('p2', 'pin', 2), tile('p3', 'pin', 3),
      tile('s7', 'sou', 7), tile('s9', 'sou', 9),
      tile('w3a', 'wind', 3), tile('w3b', 'wind', 3),
    ];
    const drawnTile = tile('p2-draw', 'pin', 2);
    const winningTile = tile('s8', 'sou', 8);
    const state = {
      ...makeInitialStateBase(hand, [], [drawnTile, winningTile], []),
      roundWind: 'east' as const,
      playerWind: 'south' as const,
    };

    const result = searchBestWin(state);

    expect(result.complete).toBe(true);
    expect(result.line[result.line.length - 1]).toMatchObject({ type: 'ron', riichi: true });
    expect(result.line.some((action) => action.type === 'discard' && action.riichi === true)).toBe(true);
  });

  it('does not claim an optimum when the safety state limit prevents search', () => {
    const state = makeInitialStateBase([], [], [tile('draw', 'man', 1)], []);

    const result = searchBestWin(state, { maxStates: 0 });

    expect(result.complete).toBe(false);
    expect(result.bestScore).toBeNull();
    expect(result.line).toEqual([]);
  });
});
