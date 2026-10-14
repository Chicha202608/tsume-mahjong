import { describe, expect, it } from 'vitest';
import { createDeck } from '@/gameLogic';
import { makeInitialStateBase } from '@/game/gameState';
import { enumerateTenpaiCandidates, findCandidateWinOpportunities } from '@/game/tenpaiCandidates';
import { evaluateCandidateWins } from '@/game/candidateReplay';
import type { Tile } from '@/types';

function makeState(cpuFirst: boolean, length: number, winningIndex: number) {
  const deck = createDeck();
  const take = (suit: Tile['suit'], value: number): Tile => {
    const i = deck.findIndex(t => t.suit === suit && t.value === value);
    if (i < 0) throw new Error('not enough tiles');
    return deck.splice(i, 1)[0];
  };
  const hand = [
    take('man',1),take('man',2),take('man',3),
    take('pin',1),take('pin',2),take('pin',3),
    take('sou',1),take('sou',2),take('sou',3),
    take('sou',7),take('sou',9),
    take('wind',1),take('wind',1),
  ];
  const win = take('sou',8);
  // Keep other 8s out of the wall so the chosen win event is unambiguous.
  const fillers = deck.filter(t => !(t.suit === 'sou' && t.value === 8));
  const wall = fillers.slice(0, length);
  wall[winningIndex] = win;
  return makeInitialStateBase(hand, [], wall, [],
    cpuFirst ? 'south' : 'east', cpuFirst ? 'east' : 'south');
}
describe('CPU-first boundary win opportunities', () => {
  it('allows first CPU discard ron without retrospectively awarding riichi', () => {
    const state = makeState(true, 2, 0);
    const wins = evaluateCandidateWins(state).filter(x => x.opportunity.wallIndex === 0 && x.opportunity.type === 'ron');
    expect(wins.some(x => x.score !== null && !x.riichi && x.discards.length === 0)).toBe(true);
  });
  it('allows last-moment riichi before CPU-first 18th CPU discard (wall 34)', () => {
    const state = makeState(true, 36, 34);
    const wins = evaluateCandidateWins(state).filter(x => x.opportunity.wallIndex === 34 && x.opportunity.type === 'ron' && x.score !== null);
    expect(wins.length).toBeGreaterThan(0);
    expect(wins.some(x => x.riichi && x.discards.length === 17)).toBe(true);
  }, 120_000);
  it('includes player-first final CPU discard after eighteenth own discard', () => {
    const state = makeState(false, 36, 35);
    const opportunities = findCandidateWinOpportunities(state, enumerateTenpaiCandidates(state));
    expect(opportunities.some(x => x.wallIndex === 35 && x.type === 'ron')).toBe(true);
  }, 120_000);
  it('treats first own draw as wall index 1 when CPU starts', () => {
    const state = makeState(true, 2, 1);
    const wins = evaluateCandidateWins(state);
    expect(wins.some(x => x.opportunity.wallIndex === 1 && x.opportunity.type === 'tsumo' && x.score !== null)).toBe(true);
  });
});
