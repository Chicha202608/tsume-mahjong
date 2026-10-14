import { describe, expect, it } from 'vitest';
import { searchBestWin } from '@/game/solver';
import { evaluateCandidateWins } from '@/game/candidateReplay';
import { makeInitialStateBase } from '@/game/gameState';
import type { Tile } from '@/types';

const t = (id: string, suit: Tile['suit'], value: number): Tile => ({ id, suit, value });
const hand = [
  t('m1','man',1),t('m2','man',2),t('m3','man',3),
  t('p1','pin',1),t('p2','pin',2),t('p3','pin',3),
  t('s1','sou',1),t('s2','sou',2),t('s3','sou',3),
  t('s7','sou',7),t('s9','sou',9),
  t('e1','wind',1),t('e2','wind',1),
];

/** Only compare fully explored old runs, and only winner outcomes for now. */
describe('candidate versus dynamic programming cross-check', () => {
  const fixtures: Array<{ name: string; wall: Tile[] }> = [
    { name: 'immediate tsumo', wall: [t('win','sou',8)] },
    { name: 'one draw then CPU ron', wall: [
      t('own','pin',9),t('cpu-win','sou',8),t('own2','sou',6),
    ] },
    { name: 'second player draw tsumo', wall: [
      t('own','pin',9),t('cpu','dragon',1),t('win','sou',8),
    ] },
    { name: 'initially unavailable wait until later ron', wall: [
      t('own','sou',9),t('cpu','dragon',1),t('own2','pin',9),t('win','sou',8),
      t('own3','sou',6),
    ] },
  ];
  for (const fixture of fixtures) {
    it(fixture.name, () => {
      const state = {
        ...makeInitialStateBase(hand, [], fixture.wall, []),
        roundWind: 'east' as const,
        playerWind: 'south' as const,
      };
      const oldResult = searchBestWin(state, { maxStates: 1_000_000, maxDurationMs: 10_000 });
      expect(oldResult.complete).toBe(true);
      const scoredNew = evaluateCandidateWins(state)
        .filter(x => x.score !== null).map(x => x.score!);
      const newBest = scoredNew.length ? Math.max(...scoredNew) : null;
      expect(newBest).toBe(oldResult.bestScore);
    });
  }
});
