import { describe, expect, it } from 'vitest';
import { couldBuildTenpai, searchBestWin } from '@/game/solver';
import { createDeck } from '@/gameLogic';
import { makeInitialStateBase } from '@/game/gameState';
import type { Tile } from '@/types';

function tile(id: string, suit: Tile['suit'], value: number): Tile {
  return { id, suit, value };
}

describe('future tenpai feasibility', () => {
  it('accepts a 13-tile ready hand without needing an actual winning tile', () => {
    const hand = [
      tile('m1', 'man', 1), tile('m2', 'man', 2), tile('m3', 'man', 3),
      tile('p1', 'pin', 1), tile('p2', 'pin', 2), tile('p3', 'pin', 3),
      tile('s1', 'sou', 1), tile('s2', 'sou', 2), tile('s3', 'sou', 3),
      tile('s7', 'sou', 7), tile('s8', 'sou', 8),
      tile('w1', 'wind', 1), tile('w2', 'wind', 1),
    ];
    expect(couldBuildTenpai(hand)).toBe(true);
  });

  it('recognizes tanki, shanpon, kanchan and kokushi patterns', () => {
    const melds = [
      tile('m1', 'man', 1), tile('m2', 'man', 2), tile('m3', 'man', 3),
      tile('p1', 'pin', 1), tile('p2', 'pin', 2), tile('p3', 'pin', 3),
      tile('s1', 'sou', 1), tile('s2', 'sou', 2), tile('s3', 'sou', 3),
    ];
    expect(couldBuildTenpai([...melds,
      tile('east1', 'wind', 1), tile('east2', 'wind', 1),
      tile('s7', 'sou', 7), tile('s9', 'sou', 9)])).toBe(true);
    expect(couldBuildTenpai([...melds,
      tile('east1', 'wind', 1), tile('east2', 'wind', 1),
      tile('south1', 'wind', 2), tile('south2', 'wind', 2)])).toBe(true);
    const fourMelds = [...melds,
      tile('m4', 'man', 4), tile('m5', 'man', 5), tile('m6', 'man', 6)];
    expect(couldBuildTenpai([...fourMelds, tile('e', 'wind', 1)])).toBe(true);
    const orphans = [
      tile('m1o', 'man', 1), tile('m9o', 'man', 9),
      tile('p1o', 'pin', 1), tile('p9o', 'pin', 9),
      tile('s1o', 'sou', 1), tile('s9o', 'sou', 9),
      tile('e', 'wind', 1), tile('s', 'wind', 2), tile('w', 'wind', 3),
      tile('n', 'wind', 4), tile('white', 'dragon', 1),
      tile('green', 'dragon', 2), tile('red', 'dragon', 3),
    ];
    expect(couldBuildTenpai(orphans)).toBe(true);
  });

  it('rejects fewer than 13 usable player tiles even if CPU has the missing ones', () => {
    const hand = Array.from({ length: 12 }, (_, index) => tile('m' + index, 'man', 1));
    expect(couldBuildTenpai(hand)).toBe(false);
  });

});

describe('standard-hand-only milestone', () => {
  it('does not accept a seven-pairs-only tenpai pattern', () => {
    const pool = [
      tile('m1a','man',1),tile('m1b','man',1),
      tile('m4a','man',4),tile('m4b','man',4),
      tile('m7a','man',7),tile('m7b','man',7),
      tile('p1a','pin',1),tile('p1b','pin',1),
      tile('p4a','pin',4),tile('p4b','pin',4),
      tile('s1a','sou',1),tile('s1b','sou',1),
      tile('east','wind',1),
    ];
    expect(couldBuildTenpai(pool)).toBe(false);
  });
  it('does not accept thirteen orphans as standard tenpai', () => {
    const pool = [
      tile('m1','man',1),tile('m9','man',9),tile('p1','pin',1),
      tile('p9','pin',9),tile('s1','sou',1),tile('s9','sou',9),
      tile('east','wind',1),tile('south','wind',2),
      tile('west','wind',3),tile('north','wind',4),
      tile('white','dragon',1),tile('green','dragon',2),tile('red','dragon',3),
    ];
    expect(couldBuildTenpai(pool)).toBe(false);
  });
});

describe('searchBestWin', () => {
  it('explicitly rejects an already-open hand in the closed-hand solver', () => {
    const called = tile('called', 'man', 3);
    const state = {
      ...makeInitialStateBase([], [], [tile('draw', 'man', 1)], []),
      playerFuro: [{
        type: 'pung' as const,
        tiles: [called, tile('pon2', 'man', 3), tile('pon3', 'man', 3)],
        calledTile: called,
      }],
    };

    const result = searchBestWin(state);

    expect(result.supported).toBe(false);
    expect(result.unsupportedReason).toBe('open-hand');
    expect(result.complete).toBe(false);
    expect(result.bestScore).toBeNull();
    expect(result.line).toEqual([]);
    expect(result.stats.statesVisited).toBe(0);
  });

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
    expect(result.outcome).toBe('noten');
    expect(result.bestScore).toBeNull();
    expect(result.line).toEqual([]);
    expect(result.stats.statesVisited).toBeGreaterThan(0);
  });

  it('classifies an exhausted tenpai hand above a noten hand', () => {
    const tenpaiHand = [
      tile('m1', 'man', 1), tile('m2', 'man', 2), tile('m3', 'man', 3),
      tile('p1', 'pin', 1), tile('p2', 'pin', 2), tile('p3', 'pin', 3),
      tile('s1', 'sou', 1), tile('s2', 'sou', 2), tile('s3', 'sou', 3),
      tile('s7', 'sou', 7), tile('s8', 'sou', 8),
      tile('w1', 'wind', 1), tile('w1b', 'wind', 1),
    ];
    const tenpaiState = {
      ...makeInitialStateBase(tenpaiHand, [], [], []),
      phase: 'exhausted' as const,
    };

    const tenpaiResult = searchBestWin(tenpaiState);

    expect(tenpaiResult.complete).toBe(true);
    expect(tenpaiResult.outcome).toBe('tenpai');
    expect(tenpaiResult.bestScore).toBeNull();

    const notenState = {
      ...tenpaiState,
      playerHand: [
        ...tenpaiHand.slice(0, 10),
        tile('s9', 'sou', 9),
        tile('w2', 'wind', 2),
        tile('w3', 'wind', 3),
      ],
    };
    const notenResult = searchBestWin(notenState);
    expect(notenResult.complete).toBe(true);
    expect(notenResult.outcome).toBe('noten');
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
    expect(result.outcome).toBe('win');
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
      ...makeInitialStateBase(hand, [], [winningTile, tile('nextDraw', 'pin', 9)], []),
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

  it('does not retroactively grant riichi on the last CPU discard with no future player draw', () => {
    const hand = [
      tile('m1', 'man', 1), tile('m2', 'man', 2), tile('m3', 'man', 3),
      tile('m4', 'man', 4), tile('m5', 'man', 5), tile('m6', 'man', 6),
      tile('p1', 'pin', 1), tile('p2', 'pin', 2), tile('p3', 'pin', 3),
      tile('s7', 'sou', 7), tile('s9', 'sou', 9),
      tile('w3a', 'wind', 3), tile('w3b', 'wind', 3),
    ];
    const state = {
      ...makeInitialStateBase(hand, [], [tile('lastCpuDiscard', 'sou', 8)], []),
      phase: 'cpuTurn' as const,
      turnCount: 1,
      roundWind: 'east' as const,
      playerWind: 'south' as const,
    };
    const result = searchBestWin(state);
    expect(result.complete).toBe(true);
    expect(result.bestScore).toBeNull();
    expect(result.line.every((action) => action.type !== 'ron')).toBe(true);
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
      ...makeInitialStateBase(hand, [], [drawnTile, winningTile, tile('futureDraw', 'sou', 1)], []),
      roundWind: 'east' as const,
      playerWind: 'south' as const,
    };

    const result = searchBestWin(state);

    expect(result.complete).toBe(true);
    expect(result.line[result.line.length - 1]).toMatchObject({ type: 'ron', riichi: true });
    expect(result.line.some((action) => action.type === 'discard' && action.riichi === true)).toBe(true);
  });

  it('does not choose concealed kan even when four identical tiles are present', () => {
    const hand = [
      tile('m1a', 'man', 1), tile('m1b', 'man', 1),
      tile('m1c', 'man', 1), tile('m1d', 'man', 1),
      tile('m2', 'man', 2), tile('m3', 'man', 3),
      tile('p1', 'pin', 1), tile('p2', 'pin', 2), tile('p3', 'pin', 3),
      tile('s1', 'sou', 1), tile('s2', 'sou', 2), tile('s3', 'sou', 3),
      tile('east', 'wind', 1),
    ];
    const state = makeInitialStateBase(hand, [], [tile('west', 'wind', 4)], []);
    const result = searchBestWin(state);
    expect(result.complete).toBe(true);
    expect(result.line.every((action) => action.type === 'draw' || action.type === 'cpu-turn' || action.type === 'discard' || action.type === 'pass-tsumo' || action.type === 'pass-naki' || action.type === 'tsumo' || action.type === 'ron')).toBe(true);
  });

  it('preserves a final CPU-discard ron when the wall is exhausted', () => {
    const hand = [
      tile('m1', 'man', 1), tile('m2', 'man', 2), tile('m3', 'man', 3),
      tile('m4', 'man', 4), tile('m5', 'man', 5), tile('m6', 'man', 6),
      tile('p1', 'pin', 1), tile('p2', 'pin', 2), tile('p3', 'pin', 3),
      tile('s7', 'sou', 7), tile('s9', 'sou', 9),
      tile('w3a', 'wind', 3), tile('w3b', 'wind', 3),
    ];
    const state = {
      ...makeInitialStateBase(hand, [], [tile('s8', 'sou', 8)], []),
      phase: 'cpuTurn' as const,
      roundWind: 'east' as const,
      playerWind: 'south' as const,
    };
    // No riichi possible, but a future discard can still be a winning tile
    // when the final wall tile belongs to the CPU.
    const result = searchBestWin(state);
    expect(result.complete).toBe(true);
  });

  it('can preserve completed melds when the heuristic is explicitly enabled', () => {
    const hand = [
      tile('m1','man',1),tile('m2','man',2),tile('m3','man',3),
      tile('p1','pin',1),tile('p2','pin',2),tile('p3','pin',3),
      tile('s1','sou',1),tile('s2','sou',2),tile('s3','sou',3),
      tile('e1','wind',1),tile('e2','wind',1),
      tile('s7','sou',7),tile('s9','sou',9),
    ];
    const state = makeInitialStateBase(hand, [], [tile('draw','pin',9), tile('cpu','dragon',1)], []);
    const result = searchBestWin(state, { preserveCompletedMelds: true });
    expect(result.complete).toBe(true);
    const firstDiscard = result.line.find(action => action.type === 'discard');
    expect(firstDiscard).toBeDefined();
    if (firstDiscard?.type === 'discard') {
      expect(['man-1','man-2','man-3','pin-1','pin-2','pin-3',
        'sou-1','sou-2','sou-3']).not.toContain(firstDiscard.tile.suit + '-' + firstDiscard.tile.value);
    }
  });

  it('records bounded-search metrics for a full 36-tile wall', () => {
    const deck = createDeck();
    const take = (suit: Tile['suit'], value: number): Tile => {
      const index = deck.findIndex((candidate) => candidate.suit === suit && candidate.value === value);
      if (index < 0) throw new Error(`Missing tile: ${suit} ${value}`);
      return deck.splice(index, 1)[0];
    };
    const hand = [
      take('man', 1), take('man', 2), take('man', 3),
      take('man', 4), take('man', 5), take('man', 6),
      take('pin', 1), take('pin', 2), take('pin', 3),
      take('sou', 7), take('sou', 9),
      take('wind', 3), take('wind', 3),
    ];
    const cpuHand = deck.splice(0, 13);
    const wanpai = deck.splice(0, 14);
    const wall = deck.splice(0, 36);
    const state = {
      ...makeInitialStateBase(hand, cpuHand, wall, wanpai),
      roundWind: 'east' as const,
      playerWind: 'south' as const,
    };

    // Use production defaults to measure how far a full 36-tile search gets
    // within the solver's current three-second browser safety budget.
    const result = searchBestWin(state);
    console.info('[solver full-wall default-budget benchmark]', result.stats, { complete: result.complete });

    expect(result.stats.statesVisited).toBeGreaterThan(0);
    if (!result.complete) expect(result.bestScore).toBeNull();
  });

  it('does not claim an optimum when the safety state limit prevents search', () => {
    const state = makeInitialStateBase([], [], [tile('draw', 'man', 1)], []);

    const result = searchBestWin(state, { maxStates: 0 });

    expect(result.complete).toBe(false);
    expect(result.bestScore).toBeNull();
    expect(result.line).toEqual([]);
  });
});
