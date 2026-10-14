import { describe, expect, it } from 'vitest';
import { createDeck } from '@/gameLogic';
import { makeInitialStateBase } from '@/game/gameState';
import { enumerateTenpaiCandidates, findCandidateWinOpportunities } from '@/game/tenpaiCandidates';
import { replayCandidateOpportunity } from '@/game/candidateReplay';
import type { Tile } from '@/types';

function face(tile: Tile): number {
  return (tile.suit === 'man' ? 0 : tile.suit === 'pin' ? 9 :
    tile.suit === 'sou' ? 18 : tile.suit === 'wind' ? 27 : 31) + tile.value - 1;
}
function count(tiles: Tile[]): number[] {
  const counts = Array<number>(34).fill(0);
  for (const tile of tiles) counts[face(tile)]++;
  return counts;
}
function seededDeal(seed: number) {
  const deck = createDeck();
  let x = seed >>> 0;
  const rand = () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return makeInitialStateBase(deck.slice(0, 13), [], deck.slice(13, 49), []);
}

describe('full-wall chronological candidate replay invariants', () => {
  it('constructs genuinely reachable targets for every advertised opportunity', () => {
    let checked = 0;
    let positive = 0;
    for (let seed = 0; seed < 12; seed++) {
      const state = seededDeal(20261014 + seed * 7919);
      const opportunities = findCandidateWinOpportunities(
        state, enumerateTenpaiCandidates(state));
      for (const opportunity of opportunities) {
        const replay = replayCandidateOpportunity(state, opportunity);
        expect(replay, `seed ${seed}, wall index ${opportunity.wallIndex}`).not.toBeNull();
        if (!replay) continue;
        const hand = [...state.playerHand];
        let discardIndex = 0;
        for (let wallIndex = 0; wallIndex < opportunity.wallIndex; wallIndex += 2) {
          hand.push(state.wall[wallIndex]);
          const discarded = replay.discards[discardIndex++];
          expect(discarded, `seed ${seed}, wall index ${wallIndex}`).toBeDefined();
          const index = hand.findIndex(tile => tile.id === discarded.id);
          expect(index, `discard must be owned at seed ${seed}, step ${wallIndex}`).toBeGreaterThanOrEqual(0);
          hand.splice(index, 1);
        }
        expect(discardIndex).toBe(replay.discards.length);
        expect(hand).toHaveLength(13);
        expect(count(hand)).toEqual(opportunity.candidate.counts);
        expect(opportunity.candidate.waits).toContain(face(state.wall[opportunity.wallIndex]));
        if (replay.score !== null) positive++;
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
    console.info('[chronological-replay] checked opportunities:', checked, 'positive scores:', positive);
  }, 240_000);
});
