import { describe, expect, it } from 'vitest';
import type { Tile } from '@/types';
import { makeInitialStateBase } from '@/game/gameState';
import { searchWithOneAnkan } from '@/game/ankanSearch';
import { findCandidateSolution } from '@/game/candidateSolution';
import { buildSolverReplay } from '@/game/solverReplay';
import { scoreHand } from '@/game/scoreAdapter';
import { createDeck } from '@/gameLogic';

function fixture(oldQuad = false, delayed = false, laterWin = false) {
  const deck = createDeck();
  const t = (suit: Tile['suit'], value: number) => {
    const index = deck.findIndex(t => t.suit === suit && t.value === value && !t.isRed);
    if (index < 0) throw new Error('Invalid fixture');
    return deck.splice(index, 1)[0];
  };
  const hand = [t('man', 1), t('man', 1), t('man', 1),
    ...[2, 3, 4].map(v => t('pin', v)), ...[3, 4, 5].map(v => t('sou', v)),
    t('sou', 7), t('sou', 8), t('pin', 5), t('pin', 5)];
  let fourth = t('man', 1);
  if (oldQuad) { hand[hand.length - 1] = fourth; fourth = t('pin', 5); }
  const win = t('sou', 9);
  const rinshan = laterWin ? t('wind', 3) : win;
  const wall = delayed ? [t('pin', 9), t('pin', 4), fourth, t('wind', 2)]
    : laterWin ? [fourth, t('wind', 2), win, t('wind', 4)] : [fourth, t('wind', 2)];
  // Deliberately use non-dora indicators for stable riichi comparisons.
  const wanpai = [rinshan, ...deck.splice(0, 3), t('dragon', 1), t('dragon', 2),
    ...deck.splice(0, 3), t('dragon', 1), t('dragon', 2), ...deck.splice(0, 3)];
  return makeInitialStateBase(hand, [], wall, wanpai, 'south', 'west');
}

function solve(initial: ReturnType<typeof fixture>) {
  const baseline = findCandidateSolution(initial);
  const result = searchWithOneAnkan(initial, baseline)!;
  expect(result?.outcome).toBe('win');
  expect(result.line.filter(a => a.type === 'ankan')).toHaveLength(1);
  const frames = buildSolverReplay(initial, result);
  expect(frames).toHaveLength(result.line.length + 1);
  const final = frames[frames.length - 1].state;
  expect(final.phase).toBe('win');
  expect(final.playerFuro).toHaveLength(1);
  expect(final.doraCount).toBe(2);
  expect(final.turnCount).toBeLessThanOrEqual(18);
  for (const { state } of frames) {
    const tiles = [...state.playerHand, ...(state.playerDrawnTile ? [state.playerDrawnTile] : []),
      ...state.playerFuro.flatMap(f => f.tiles), ...state.playerDiscards];
    expect(new Set(tiles.map(t => t.id)).size).toBe(tiles.length);
  }
  const score = scoreHand(final)!;
  expect(score.valid).toBe(true);
  expect(result.bestScore).toBe(Math.max(...score.handInterpretations.map(h => h.totalWinnings)));
  return { result, final, score, frames };
}

describe('one concealed kan candidate search', () => {
  it.each([false, true])('wins on rinshan without losing the original draw (old quad=%s)', oldQuad => {
    const initial = fixture(oldQuad);
    const before = JSON.stringify(initial);
    const { final, score } = solve(initial);
    expect(final.drawnFromRinshan).toBe(true);
    expect(score.handInterpretations.some(h => h.yaku.some(y => y.name === 'rinshan-kaihou'))).toBe(true);
    expect(score.handInterpretations.every(h => h.yaku.every(y => y.name !== 'ippatsu' && y.name !== 'haitei'))).toBe(true);
    expect(JSON.stringify(initial)).toBe(before);
  });

  it('declares riichi before drawing the fourth kan tile and cancels ippatsu', () => {
    const { result, final, frames, score } = solve(fixture(false, true));
    const declaration = result.line.findIndex(a => a.type === 'discard' && a.riichi);
    const kan = result.line.findIndex(a => a.type === 'ankan');
    expect(declaration).toBeGreaterThanOrEqual(0);
    expect(declaration).toBeLessThan(kan);
    expect(final.isRiichi).toBe(true);
    expect(final.isIppatsu).toBe(false);
    expect(frames.filter(f => f.state.isRiichi).every(f => f.state.nakiOptions.length === 0)).toBe(true);
    expect(score.handInterpretations.some(h => h.yaku.some(y => y.name === 'riichi'))).toBe(true);
  });

  it('resets the rinshan flag on subsequent ordinary draws', () => {
    const { final, score } = solve(fixture(false, false, true));
    expect(final.drawnFromRinshan).toBe(false);
    expect(score.handInterpretations.every(h => h.yaku.every(y => y.name !== 'rinshan-kaihou'))).toBe(true);
  });

  it.each([false, true])('wins by ron after kan, from either opening seat (CPU first=%s)', cpuFirst => {
    const initial = fixture(false, false, true);
    [initial.wall[1], initial.wall[2]] = [initial.wall[2], initial.wall[1]];
    if (cpuFirst) {
      initial.phase = 'cpuTurn';
      const used = new Set([...initial.playerHand, ...initial.wall, ...initial.wanpai].map(t => t.id));
      initial.wall.unshift(createDeck().find(t => !used.has(t.id))!);
    }
    initial.fullWall = [...initial.wall];
    const { final, score } = solve(initial);
    expect(final.winType).toBe('ron');
    expect(final.isRiichi).toBe(true);
    expect(score.handInterpretations.every(h => h.yaku.every(y => y.name !== 'rinshan-kaihou'))).toBe(true);
  });

  it('counts the additional kan dora in the same scorer used by replay', () => {
    const initial = fixture();
    const used = new Set([...initial.playerHand, ...initial.wall, ...initial.wanpai].map(t => t.id));
    const indicator = createDeck().find(t => t.suit === 'man' && t.value === 9 && !used.has(t.id))!;
    initial.wanpai[5] = indicator; // The four concealed 1m become dora.
    const { score } = solve(initial);
    expect(score.handInterpretations.some(h => h.dora >= 4)).toBe(true);
  });

  it('keeps an available no-kan answer when it scores higher', () => {
    const initial = fixture();
    const baseline = { supported: true, complete: false, outcome: 'win' as const,
      bestScore: 100000, line: [], stats: { statesVisited: 0, cacheHits: 0, prunedBranches: 0, elapsedMs: 0 } };
    expect(searchWithOneAnkan(initial, baseline)).toBe(baseline);
  });

  it('handles a 36-tile wall within the additional-search budget', () => {
    const initial = fixture();
    const used = new Set([...initial.playerHand, ...initial.wall, ...initial.wanpai].map(t => t.id));
    const remaining = createDeck().filter(t => !used.has(t.id));
    let seed = 771;
    for (let i = remaining.length - 1; i > 0; i--) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const j = seed % (i + 1);
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }
    initial.wall = [...initial.wall, ...remaining].slice(0, 36);
    initial.fullWall = [...initial.wall];
    const start = Date.now();
    const result = searchWithOneAnkan(initial, null, 2000)!;
    expect(result?.outcome).toBe('win');
    expect(Date.now() - start).toBeLessThan(3000);
    const frames = buildSolverReplay(initial, result);
    expect(frames).toHaveLength(result.line.length + 1);
    expect(frames[frames.length - 1].state.phase).toBe('win');
    console.log('[one-kan 36-wall]', result.stats);
  });

  it('retains the baseline when the time budget is exhausted', () => {
    const initial = fixture();
    const baseline = findCandidateSolution(initial);
    expect(searchWithOneAnkan(initial, baseline, 0)).toBe(baseline);
  });

  it('does not use the trimmed final wall tile as a fourth kan tile', () => {
    const initial = fixture();
    initial.wall.reverse();
    const result = searchWithOneAnkan(initial, null);
    expect(result).toBeNull();
  });
});
