import { describe, expect, it } from 'vitest';
import { makeInitialStateBase } from '@/game/gameState';
import { evaluateCandidateWins } from '@/game/candidateReplay';
import { scoreHand } from '@/game/scoreAdapter';
import type { Tile } from '@/types';

const t = (suit: Tile['suit'], value: number, id: string, isRed = false): Tile =>
  ({ suit, value, id, ...(isRed ? { isRed: true } : {}) });
const hand: Tile[] = [
  t('man', 1, 'm1'), t('man', 2, 'm2'), t('man', 3, 'm3'),
  t('pin', 1, 'p1'), t('pin', 2, 'p2'), t('pin', 3, 'p3'),
  t('sou', 1, 's1'), t('sou', 2, 's2'), t('sou', 3, 's3'),
  t('sou', 7, 's7'), t('sou', 9, 's9'),
  t('wind', 1, 'e1'), t('wind', 1, 'e2'),
];
const win = t('sou', 8, 'winning-s8');
const maxScore = (state: ReturnType<typeof makeInitialStateBase>, type: 'ron' | 'tsumo') => {
  const result = scoreHand({ ...state, playerHand: hand, phase: 'win', winTile: win,
    winType: type, playerDrawnTile: null, isRiichi: false, isIppatsu: false });
  return result?.valid && result.handInterpretations.length
    ? Math.max(...result.handInterpretations.map(h => h.totalWinnings)) : null;
};

describe('identical closed hand and winning face', () => {
  it('never awards less total winnings for tsumo than ron under identical flags', () => {
    const state = { ...makeInitialStateBase(hand, [], [], []),
      roundWind: 'east' as const, playerWind: 'south' as const };
    const ron = maxScore(state, 'ron');
    const tsumo = maxScore(state, 'tsumo');
    expect(ron).not.toBeNull();
    expect(tsumo).not.toBeNull();
    expect(tsumo!).toBeGreaterThanOrEqual(ron!);
  });

  it('evaluates later own tsumo even when the same face was offered earlier for ron', () => {
    const state = { ...makeInitialStateBase(hand, [], [
      t('pin',9,'surplus'), t('sou',8,'early-ron'),
      t('sou',8,'later-tsumo'), t('dragon',1,'later-cpu'),
    ], []), roundWind: 'east' as const, playerWind: 'south' as const };
    const wins = evaluateCandidateWins(state).filter(r => r.score !== null);
    expect(wins.some(r => r.opportunity.wallIndex === 1 &&
      r.opportunity.type === 'ron')).toBe(true);
    expect(wins.some(r => r.opportunity.wallIndex === 2 &&
      r.opportunity.type === 'tsumo')).toBe(true);
    const ron = Math.max(...wins.filter(r => r.opportunity.wallIndex === 1).map(r => r.score!));
    const tsumo = Math.max(...wins.filter(r => r.opportunity.wallIndex === 2).map(r => r.score!));
    expect(tsumo).toBeGreaterThanOrEqual(ron);
  });
});
