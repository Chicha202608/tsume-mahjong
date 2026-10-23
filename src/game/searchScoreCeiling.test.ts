import { describe, expect, it } from 'vitest';
import type { Tile } from '@/types';
import { makeInitialStateBase } from '@/game/gameState';
import { searchScoreCeiling } from '@/game/searchScoreCeiling';
import { scoreHand } from '@/game/scoreAdapter';
import { searchWithAnkan } from '@/game/ankanSearch';
import { searchWithNuki, searchWithOpenCalls, type OpenSearchStats } from '@/game/openSearch';
import type { SolverResult } from '@/game/solver';

const tile = (suit: Tile['suit'], value: number, id: number): Tile => ({ suit, value, id: `ceiling-${id}` });
const honors = () => [1, 2, 3, 4].flatMap(v => Array.from({ length: 3 }, (_, i) => tile('wind', v, v * 4 + i)))
  .concat([tile('dragon', 1, 30), tile('dragon', 1, 31)]);

describe('search payout ceiling', () => {
  it('accepts no-kan sampling states with only dora indicators in the dead wall', () => {
    const wanpai = Array<Tile>(10);
    wanpai[4] = tile('pin', 1, 100);
    wanpai[9] = tile('sou', 1, 101);
    const state = makeInitialStateBase([], [], [], wanpai, 'south', 'east');
    expect(searchScoreCeiling(state)).toBe(32000);
  });

  it.each([['east', 48000], ['south', 32000]] as const)('bounds ordinary hands for %s', (wind, expected) => {
    const hand = Array.from({ length: 13 }, (_, i) => tile('pin', i % 9 + 1, i));
    const initial = { ...makeInitialStateBase(hand, [], [], [], wind, 'west'), mode: 'three' as const };
    expect(searchScoreCeiling(initial)).toBe(expected);
  });

  it('keeps searching when stacked yakuman can exceed a single yakuman', () => {
    const material = honors();
    const winTile = material.pop()!;
    const initial = { ...makeInitialStateBase(material, [], [winTile], [], 'east', 'south'), mode: 'three' as const };
    const result = scoreHand({ ...initial, phase: 'win', winType: 'ron', winTile, winFromWind: 'south' })!;
    const actual = result.handInterpretations[0].totalWinnings;
    expect(actual).toBeGreaterThan(48000);
    expect(searchScoreCeiling(initial)).toBeGreaterThanOrEqual(actual);
  });

  it('includes future opponent draws and rinshan in the optimistic supply', () => {
    const material = honors();
    const initial = { ...makeInitialStateBase(material.slice(0, 10), [], material.slice(10, 12), material.slice(12), 'east', 'south'),
      mode: 'three' as const };
    expect(searchScoreCeiling(initial)).toBeGreaterThan(48000);
  });

  it('does no target replay in optional searches once the baseline reaches the ceiling', () => {
    const hand = Array.from({ length: 13 }, (_, i) => tile('pin', i % 9 + 1, i));
    const initial = { ...makeInitialStateBase(hand, [], [], Array.from({ length: 14 }, (_, i) => tile('sou', i % 9 + 1, i + 20)), 'east', 'south'),
      mode: 'three' as const, phase: 'playerDraw' as const };
    const baseline: SolverResult = { supported: true, complete: false, outcome: 'win', bestScore: 48000, line: [],
      stats: { statesVisited: 0, cacheHits: 0, prunedBranches: 0, elapsedMs: 0 } };
    expect(searchWithAnkan(initial, baseline)).toBe(baseline);
    for (const search of [searchWithNuki, searchWithOpenCalls]) {
      let stats: OpenSearchStats | undefined;
      const found = search === searchWithNuki
        ? searchWithNuki(initial, baseline, 1000, value => { stats = value; })
        : searchWithOpenCalls(initial, baseline, 1000, 4, value => { stats = value; });
      expect(found).toBe(baseline);
      expect(stats).toMatchObject({ targets: 0, replayedLines: 0, timeLimitReached: false });
    }
  });
});
