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
  it('permits ron without any discarded waiting tile', () => {
    const state = { ...makeInitialStateBase(hand,[],[
      tile('pin',9,'own'),tile('sou',8,'ron'),tile('man',9,'own2'),
    ],[]), roundWind: 'east' as const, playerWind: 'south' as const };
    const results = evaluateCandidateWins(state);
    expect(results.some(r => r.opportunity.wallIndex === 1 &&
      r.opportunity.type === 'ron' && !r.furiten && r.score !== null)).toBe(true);
  });

  it('allows tsumo even when an earlier river tile causes furiten', () => {
    const state = { ...makeInitialStateBase(hand,[],[
      tile('pin',9,'own'),tile('dragon',1,'cpu'),tile('sou',8,'tsumo'),
    ],[]), playerDiscards: [tile('sou',8,'past-wait')],
      roundWind: 'east' as const, playerWind: 'south' as const };
    const results = evaluateCandidateWins(state);
    expect(results.some(r => r.opportunity.wallIndex === 2 &&
      r.opportunity.type === 'tsumo' && r.furiten && r.score !== null)).toBe(true);
  });

  it('does not treat discarding unrelated tiles as furiten', () => {
    const state = { ...makeInitialStateBase(hand,[],[
      tile('pin',9,'own'),tile('sou',8,'ron'),tile('man',9,'own2'),
    ],[]), playerDiscards: [tile('dragon',1,'unrelated')],
      roundWind: 'east' as const, playerWind: 'south' as const };
    const results = evaluateCandidateWins(state);
    expect(results.some(r => r.opportunity.wallIndex === 1 &&
      r.opportunity.type === 'ron' && !r.furiten && r.score !== null)).toBe(true);
  });

  it('retains a red five instead of a normal five when both fit the same target', () => {
    const redHand = [
      tile('man',1,'m1'),tile('man',2,'m2'),tile('man',3,'m3'),
      tile('pin',1,'p1'),tile('pin',2,'p2'),tile('pin',3,'p3'),
      tile('sou',4,'s4'),{...tile('sou',5,'red5'),isRed:true},tile('sou',6,'s6'),
      tile('sou',7,'s7'),tile('sou',9,'s9'),
      tile('wind',1,'e1'),tile('wind',1,'e2'),
    ];
    const state = {...makeInitialStateBase(redHand,[],[
      tile('sou',5,'normal5'),tile('dragon',1,'cpu'),
      tile('sou',8,'tsumo'),
    ],[]),roundWind:'east' as const,playerWind:'south' as const};
    const scores=evaluateCandidateWins(state);
    const result=scores.find(x=>x.opportunity.wallIndex===2 && x.opportunity.type==='tsumo' &&
      x.opportunity.candidate.counts[22]===1 && x.score!==null);
    expect(result).toBeDefined();
    expect(result?.discards[0].id).toBe('normal5');
  });
  it('does not grant last-moment riichi on a final CPU discard with no future own draw', () => {
    const state = {...makeInitialStateBase(hand,[],[
      tile('pin',9,'own'),tile('sou',8,'ron'),
    ],[]),roundWind:'east' as const,playerWind:'south' as const};
    const results=evaluateCandidateWins(state);
    expect(results.filter(x=>x.opportunity.type==='ron' && x.score!==null)
      .every(x=>x.riichi===false)).toBe(true);
  });

});
