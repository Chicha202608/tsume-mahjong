import { describe, expect, it } from 'vitest';
import { createDeck } from '@/gameLogic';
import { makeInitialStateBase } from '@/game/gameState';
import { evaluateCandidateWins } from '@/game/candidateReplay';
import { searchBestWin } from '@/game/solver';
import type { Tile } from '@/types';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
function shuffledDeck(seed: number): Tile[] {
  const deck = createDeck();
  const random = rng(seed);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
function winningDeal(seed: number, length: number) {
  const random = rng(seed);
  const deck = createDeck();
  const chosen: Tile[] = [];
  const take = (suit: Tile['suit'], value: number) => {
    const index = deck.findIndex(t => t.suit === suit && t.value === value);
    if (index < 0) throw new Error('could not build unique complete hand');
    chosen.push(...deck.splice(index, 1));
  };
  for (const suit of ['man', 'pin', 'sou'] as const) {
    const start = 1 + Math.floor(random() * 7);
    for (let v = start; v < start + 3; v++) take(suit, v);
  }
  const start = 1 + Math.floor(random() * 7);
  for (let v = start; v < start + 3; v++) take('man', v);
  take('wind', 1);
  take('wind', 1);

  // Put one target tile into the future wall and, in half the cases, displace
  // another target tile into the first own draw. Every physical ID is unique.
  const win = chosen.splice(Math.floor(random() * chosen.length), 1)[0];
  const displaced = seed % 2 ? chosen.splice(Math.floor(random() * chosen.length), 1)[0] : null;
  const fill = displaced ? deck.splice(Math.floor(random() * deck.length), 1)[0] : null;
  const hand = [...chosen, ...(fill ? [fill] : [])];
  const wall: Tile[] = [];
  for (let i = 0; i < length; i++) {
    const index = Math.floor(random() * deck.length);
    wall.push(...deck.splice(index, 1));
  }
  const winIndex = displaced ? Math.min(length - 1, 3) : Math.floor(random() * length);
  // Return replaced tiles to the unseen pool; do not duplicate their IDs.
  wall[winIndex] = win;
  if (displaced) wall[0] = displaced;
  return { hand, wall };
}

describe('expanded complete-DP versus candidate maximum-score cross-check', () => {
  it('compares 200 independent short-wall deals (100 random, 100 constructed)', () => {
    const errors: string[] = [];
    const counts = { compared: 0, random: 0, constructed: 0, wins: 0, noWins: 0, incomplete: 0 };
    for (let k = 0; k < 200; k++) {
      const constructed = k % 2 === 1;
      const length = 3 + (k % 6);
      const { hand, wall } = constructed
        ? winningDeal(907000 + k * 101, length)
        : (() => { const deck = shuffledDeck(707000 + k * 101);
            return { hand: deck.slice(0, 13), wall: deck.slice(13, 13 + length) }; })();
      const state = { ...makeInitialStateBase(hand, [], wall, []),
        roundWind: 'east' as const, playerWind: 'south' as const };
      const old = searchBestWin(state, { maxStates: 1_000_000, maxDurationMs: 10_000 });
      if (!old.complete) {
        counts.incomplete++;
        errors.push(`incomplete seed=${k}, length=${length}`);
        continue;
      }
      const scored = evaluateCandidateWins(state).filter(r => r.score !== null);
      const best = scored.length ? Math.max(...scored.map(r => r.score!)) : null;
      counts.compared++;
      counts[constructed ? 'constructed' : 'random']++;
      if (old.bestScore === null) counts.noWins++; else counts.wins++;
      if (old.bestScore !== best) {
        errors.push(JSON.stringify({ seed: k, constructed, length,
          hand: hand.map(t => t.id), wall: wall.map(t => t.id),
          exhaustive: old.bestScore, candidates: best }));
      }
    }
    console.info('[expanded comparison]', { ...counts, mismatches: errors.length, details: errors.slice(0, 12) });
    expect(errors, errors.slice(0, 12).join('\n')).toEqual([]);
    expect(counts.compared).toBe(200);
  }, 300_000);
});
