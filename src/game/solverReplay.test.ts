import { describe, expect, it } from 'vitest';
import { createDeck } from '@/gameLogic';
import { makeInitialStateBase } from '@/game/gameState';
import type { SolverResult } from '@/game/solver';
import { buildNotenReplay, buildSolverReplay } from '@/game/solverReplay';

function fixture() {
  const deck = createDeck();
  return makeInitialStateBase(deck.slice(0, 13), deck.slice(13, 26),
    deck.slice(40, 76), deck.slice(26, 40), 'east', 'south');
}

describe('solver replay modal state', () => {
  it('keeps the original state untouched while showing a complete tsumogiri sequence', () => {
    const initial = fixture();
    const original = JSON.stringify(initial);
    const frames = buildNotenReplay(initial);
    expect(frames.length).toBeGreaterThan(1);
    expect(frames[0].state).toBe(initial);
    expect(frames[frames.length - 1]?.state.phase).toBe('exhausted');
    expect(JSON.stringify(initial)).toBe(original);
    expect(frames.filter(f => f.action?.type === 'discard').every(f =>
      f.state.playerDiscards[f.state.playerDiscards.length - 1]?.id === (f.action?.type === 'discard' ? f.action.tile.id : '')
    )).toBe(true);
  });

  it('does not replay incomplete or unsupported solver results', () => {
    const result: SolverResult = {
      supported: true, outcome: null, bestScore: null, line: [], complete: false,
      stats: { statesVisited: 10, cacheHits: 0, prunedBranches: 0, elapsedMs: 1 },
    };
    expect(buildSolverReplay(fixture(), result)).toEqual([]);
  });
});
