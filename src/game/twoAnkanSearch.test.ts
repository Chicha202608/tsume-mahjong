import { describe, expect, it } from 'vitest';
import type { Tile } from '@/types';
import { createDeck } from '@/gameLogic';
import { makeInitialStateBase } from '@/game/gameState';
import { searchWithAnkan, searchWithOneAnkan } from '@/game/ankanSearch';
import { buildSolverReplay } from '@/game/solverReplay';
import { scoreHand } from '@/game/scoreAdapter';
import { makeTwoAnkanTestState } from '@/game/testScenarios';

function fixture(reverse = false, later = false, riichi = false) {
  const deck = createDeck();
  const take = (suit: Tile['suit'], value: number) => {
    const index = deck.findIndex(t => t.suit === suit && t.value === value && !t.isRed);
    if (index < 0) throw new Error('Invalid two-kan fixture');
    return deck.splice(index, 1)[0];
  };
  const hand = [...[1, 1, 1, 9, 9, 9].map(v => take('man', v)),
    ...[2, 3, 4, 5, 5].map(v => take('pin', v)), take('sou', 7), take('sou', 8)];
  const fourth = take('man', reverse ? 9 : 1);
  const otherFourth = take('man', reverse ? 1 : 9);
  const win = take('sou', 9);
  const wall = later ? [fourth, take('wind', 1), otherFourth, take('wind', 2), take('wind', 3), take('wind', 4)]
    : [fourth, take('wind', 1), take('wind', 2), take('wind', 3)];
  // In the chained case, the first rinshan tile completes the second quad.
  const wanpai = [later ? take('dragon', 1) : otherFourth, win, ...deck.splice(0, 2),
    take('dragon', 1), take('dragon', 2), take('dragon', 3), ...deck.splice(0, 2),
    take('dragon', 1), take('dragon', 2), take('dragon', 3), ...deck.splice(0, 2)];
  return { ...makeInitialStateBase(hand, [], wall, wanpai, 'south', 'west'), isRiichi: riichi };
}

function verify(initial: ReturnType<typeof fixture>) {
  const before = JSON.stringify(initial);
  const result = searchWithAnkan(initial, null)!;
  expect(result?.outcome).toBe('win');
  expect(result.line.filter(a => a.type === 'ankan')).toHaveLength(2);
  const frames = buildSolverReplay(initial, result);
  expect(frames).toHaveLength(result.line.length + 1);
  const final = frames[frames.length - 1].state;
  expect(final.phase).toBe('win');
  expect(final.playerFuro).toHaveLength(2);
  expect(final.doraCount).toBe(3);
  expect(final.drawnFromRinshan).toBe(true);
  expect(final.turnCount).toBeLessThanOrEqual(18);
  for (const { state } of frames) {
    expect(state.playerFuro.length).toBeLessThanOrEqual(2);
    const tiles = [...state.playerHand, ...(state.playerDrawnTile ? [state.playerDrawnTile] : []),
      ...state.playerFuro.flatMap(f => f.tiles), ...state.playerDiscards];
    expect(new Set(tiles.map(t => t.id)).size).toBe(tiles.length);
    const expected = 13 - 3 * state.playerFuro.length + (state.playerDrawnTile ? 1 : 0);
    expect(state.playerHand.length + (state.playerDrawnTile ? 1 : 0)).toBe(expected);
  }
  const score = scoreHand(final)!;
  expect(score.valid).toBe(true);
  expect(result.bestScore).toBe(Math.max(...score.handInterpretations.map(h => h.totalWinnings)));
  expect(score.handInterpretations.some(h => h.yaku.some(y => y.name === 'rinshan-kaihou'))).toBe(true);
  expect(score.handInterpretations.every(h => h.yaku.every(y => y.name !== 'ippatsu'))).toBe(true);
  expect(JSON.stringify(initial)).toBe(before);
  return { result, final, frames };
}

describe('two concealed kan search', () => {
  it.each([false, true])('UI preparation creates a reproducible legal two-kan win (chained=%s)', chained => {
    const initial = makeTwoAnkanTestState(chained);
    expect(makeTwoAnkanTestState(chained)).toEqual(initial);
    expect(initial.wall).toHaveLength(2 * (18 - initial.turnCount));
    const tiles = [...initial.playerHand, ...initial.cpuHand, ...initial.wall, ...initial.wanpai];
    expect(new Set(tiles.map(t => t.id)).size).toBe(tiles.length);
    const { frames } = verify(initial);
    const kans = frames.filter(f => f.action?.type === 'ankan');
    expect(kans[1].state.wallDrawnCount === kans[0].state.wallDrawnCount).toBe(chained);
  });

  it.each([false, true])('chains the first rinshan into a second kan (reverse=%s)', reverse => {
    const initial = fixture(reverse);
    const oneKan = searchWithOneAnkan(initial, null)!;
    expect(oneKan.outcome).toBe('tenpai');
    expect(oneKan.bestScore).toBe(3000);
    const oneKanFrames = buildSolverReplay(initial, oneKan);
    expect(oneKanFrames).toHaveLength(oneKan.line.length + 1);
    expect(oneKanFrames[oneKanFrames.length - 1].state.phase).toBe('exhausted');
    verify(initial);
  });

  it('retains the second triple until a later fourth-copy draw', () => {
    const { frames, result } = verify(fixture(false, true));
    const kans = frames.filter(f => f.action?.type === 'ankan');
    expect(kans[1].state.wallDrawnCount).toBeGreaterThan(kans[0].state.wallDrawnCount);
    const declaration = result.line.findIndex(a => a.type === 'discard' && a.riichi);
    const kanIndices = result.line.flatMap((a, i) => a.type === 'ankan' ? [i] : []);
    expect(declaration).toBeGreaterThan(kanIndices[0]);
    expect(declaration).toBeLessThan(kanIndices[1]);
  });

  it('handles two quads already held without losing the unrelated draw', () => {
    const initial = fixture();
    const pair = initial.playerHand.filter(t => t.suit === 'pin' && t.value === 5);
    initial.playerHand = [...initial.playerHand.filter(t => !pair.includes(t)), initial.wall[0], initial.wanpai[0]];
    initial.wall[0] = pair[0];
    initial.wanpai[0] = pair[1];
    initial.fullWall = [...initial.wall];
    const { final } = verify(initial);
    expect(final.playerHand.filter(t => t.suit === 'pin' && t.value === 5)).toHaveLength(2);
  });

  it('permits two legal kans after riichi without restoring ippatsu', () => {
    const { final } = verify(fixture(false, false, true));
    expect(final.isRiichi).toBe(true);
    expect(final.isIppatsu).toBe(false);
  });

  it('publishes the one-kan result before searching two kans', () => {
    const stages: Array<number | null> = [];
    const result = searchWithAnkan(fixture(), null, 8000, 2,
      progress => stages.push(progress?.line.filter(a => a.type === 'ankan').length ?? null));
    expect(stages).toEqual([1, 2]);
    expect(result?.bestScore).toBeGreaterThan(0);
  });

  it('does not use either of the two trimmed tail tiles', () => {
    const initial = fixture(false, true);
    [initial.wall[2], initial.wall[initial.wall.length - 1]] = [initial.wall[initial.wall.length - 1], initial.wall[2]];
    initial.fullWall = [...initial.wall];
    const result = searchWithAnkan(initial, null);
    expect(result?.line.filter(a => a.type === 'ankan').length ?? 0).toBeLessThan(2);
  });

  it('keeps the existing answer when no time is available', () => {
    const initial = fixture();
    const baseline = { supported: true, complete: false, outcome: 'win' as const,
      bestScore: 100000, line: [], stats: { statesVisited: 0, cacheHits: 0, prunedBranches: 0, elapsedMs: 0 } };
    expect(searchWithAnkan(initial, baseline, 0)).toBe(baseline);
  });

  it.each([17, 771, 2026])('bounds a full-wall search and records workload (seed %i)', initialSeed => {
    const initial = fixture();
    const used = new Set([...initial.playerHand, ...initial.wall, ...initial.wanpai].map(t => t.id));
    const remaining = createDeck().filter(t => !used.has(t.id));
    let seed = initialSeed;
    for (let i = remaining.length - 1; i > 0; i--) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const j = seed % (i + 1);
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }
    initial.wall = [...initial.wall, ...remaining].slice(0, 36);
    initial.fullWall = [...initial.wall];
    const start = Date.now();
    const result = searchWithAnkan(initial, null, 1000)!;
    expect(result?.outcome).toBe('win');
    expect(Date.now() - start).toBeLessThan(2500);
    expect(result.line.filter(a => a.type === 'ankan').length).toBeLessThanOrEqual(2);
    const frames = buildSolverReplay(initial, result);
    expect(frames).toHaveLength(result.line.length + 1);
    expect(frames[frames.length - 1].state.phase).toBe('win');
    console.log(`[two-kan 36-wall seed ${initialSeed}]`, result.stats);
  });
});
