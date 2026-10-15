import { describe, expect, it } from 'vitest';
import { createDeck } from '@/gameLogic';
import { makeInitialStateBase } from '@/game/gameState';
import type { SolverResult } from '@/game/solver';
import { buildNotenReplay, buildSolverReplay } from '@/game/solverReplay';
import { findCandidateSolution } from '@/game/candidateSolution';
import { applyCpuTurn, applyPlayerDiscard, applyPlayerDraw } from '@/game/transitions';
import type { Tile } from '@/types';

function fixture() {
  const deck = createDeck();
  return makeInitialStateBase(deck.slice(0, 13), deck.slice(13, 26),
    deck.slice(40, 76), deck.slice(26, 40), 'east', 'south');
}

describe('solver replay modal state', () => {
  it.each(['ron', 'tsumo'] as const)('does not offer calls after the AI declares riichi before %s', winType => {
    let id = 0;
    const t = (suit: Tile['suit'], value: number): Tile => ({ suit, value, id: `riichi-${id++}` });
    const hand = [
      ...[1, 2, 3].map(v => t('man', v)),
      ...[1, 2, 3].map(v => t('pin', v)),
      ...[1, 2, 3, 7, 9].map(v => t('sou', v)),
      t('wind', 1), t('wind', 1),
    ];
    // 1m would offer chii without riichi; 8s is the only winning face.
    const wall = winType === 'tsumo'
      ? [t('pin', 9), t('man', 1), t('sou', 8)]
      : [t('pin', 9), t('sou', 8), t('pin', 8)];
    const initial = makeInitialStateBase(hand, [], wall, [], 'east', 'south');
    const afterDiscard = applyPlayerDiscard(applyPlayerDraw(initial)!, wall[0])!;
    expect(applyCpuTurn(afterDiscard)?.nakiOptions.length).toBeGreaterThan(0);
    const result = findCandidateSolution(initial)!;
    expect(result?.outcome).toBe('win');
    expect(result.line.some(a => a.type === 'discard' && a.riichi)).toBe(true);
    expect(result.line.some(a => a.type === 'pass-naki')).toBe(false);
    const frames = buildSolverReplay(initial, result);
    expect(frames).toHaveLength(result.line.length + 1);
    expect(frames[frames.length - 1].state.winType).toBe(winType);
    const riichiFrames = frames.filter(f => f.state.isRiichi);
    expect(riichiFrames.length).toBeGreaterThan(0);
    expect(riichiFrames.every(f => f.state.nakiOptions.length === 0)).toBe(true);
    if (winType === 'ron') expect(riichiFrames.some(f => f.state.phase === 'naki' && f.state.ronAvailable)).toBe(true);
  });

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
