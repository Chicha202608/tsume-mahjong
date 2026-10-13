import { describe, expect, it } from 'vitest';
import { evaluateCandidateWins } from '@/game/candidateReplay';
import { makeInitialStateBase } from '@/game/gameState';
import type { Tile } from '@/types';
const tile = (suit: Tile['suit'], value: number, id: string): Tile => ({ suit, value, id });

describe('candidate replay', () => {
  const hand = [
    tile('man',1,'m1'),tile('man',2,'m2'),tile('man',3,'m3'),
    tile('pin',1,'p1'),tile('pin',2,'p2'),tile('pin',3,'p3'),
    tile('sou',1,'s1'),tile('sou',2,'s2'),tile('sou',3,'s3'),
    tile('sou',7,'s7'),tile('sou',9,'s9'),
    tile('wind',1,'e1'),tile('wind',1,'e2'),
  ];
  it('scores immediate standard-hand tsumo without a discard', () => {
    const state = makeInitialStateBase(hand,[],[tile('sou',8,'win')],[]);
    const results = evaluateCandidateWins(state);
    expect(results.some(r => r.opportunity.type === 'tsumo' &&
      r.opportunity.wallIndex === 0 && r.score !== null &&
      r.discards.length === 0)).toBe(true);
  });
  it('does not ron a tile when the target wait is in the river', () => {
    const state = { ...makeInitialStateBase(hand,[],[
      tile('pin',9,'own'),tile('sou',8,'ron'),tile('man',9,'own2'),
    ],[]), playerDiscards: [tile('sou',8,'past-discard')] };
    const results = evaluateCandidateWins(state);
    expect(results.filter(r => r.opportunity.wallIndex === 1 &&
      r.opportunity.type === 'ron').every(r => r.score === null)).toBe(true);
  });
});
