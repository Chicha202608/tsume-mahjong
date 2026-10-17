import { describe, expect, it } from 'vitest';
import type { Tile } from '@/types';
import { createDeck, sortHand } from '@/gameLogic';
import { makeInitialStateBase } from '@/game/gameState';
import { searchWithOneOpenCall, openHanUpperBound, type OpenSearchStats } from '@/game/openSearch';
import { buildSolverReplay } from '@/game/solverReplay';
import { scoreHand } from '@/game/scoreAdapter';
import type { SolverResult } from '@/game/solver';

function fixture(kind: 'pon' | 'chi' | 'low' = 'pon', four = true) {
  const deck = createDeck();
  const t = (suit: Tile['suit'], value: number) => {
    const index = deck.findIndex(t => t.suit === suit && t.value === value && !t.isRed);
    if (index < 0) throw new Error('Invalid test tile');
    return deck.splice(index, 1)[0];
  };
  let hand: Tile[], call: Tile, win: Tile;
  if (kind === 'chi') {
    hand = [1,2,4,5,6,7,8,9,5,5,2,3].map(v => t('man', v));
    call = t('man', 3); win = t('man', 1);
  } else if (kind === 'low') {
    hand = [t('dragon',1), t('dragon',1), ...[1,2,3].map(v => t('man',v)),
      ...[1,2,3].map(v => t('pin',v)), t('sou',7),t('sou',8),t('pin',9),t('pin',9)];
    call = t('dragon',1); win = t('sou',9);
  } else {
    hand = [t('dragon',1),t('dragon',1),t('dragon',2),t('dragon',2),t('dragon',2),
      t('man',1),t('man',1),t('man',1),t('man',9),t('man',9),t('man',2),t('man',2)];
    call = t('dragon',1); win = t('man',9);
  }
  hand.push(t('wind',4));
  const wall = [call,win,t('wind',3),t('wind',2),t('pin',8),t('pin',7)];
  const initial = { ...makeInitialStateBase(sortHand(hand), [], wall, [], 'south','east'),
    roundWind: 'east' as const,
    ...(four ? { mode: 'four' as const, nextSeat: 'east' as const } : {}) };
  return { initial, deck, t };
}

function verify(initial: ReturnType<typeof fixture>['initial'], result: SolverResult) {
  const frames = buildSolverReplay(initial, result);
  expect(frames.length).toBe(result.line.length + 1);
  const final = frames[frames.length - 1].state;
  expect(final.phase).toBe('win');
  expect(final.playerFuro).toHaveLength(1);
  expect(final.isRiichi).toBe(false);
  expect(result.line.filter(a => a.type === 'call-naki')).toHaveLength(1);
  expect(result.line.some(a => a.type === 'ankan')).toBe(false);
  expect(result.bestScore).toBe(Math.max(...scoreHand(final)!.handInterpretations.map(h => h.totalWinnings)));
  for (const { state } of frames) {
    const all = [...state.playerHand, ...(state.playerDrawnTile ? [state.playerDrawnTile] : []),
      ...state.playerDiscards, ...state.playerFuro.flatMap(f => f.tiles)];
    expect(new Set(all.map(t => t.id)).size).toBe(all.length);
  }
  return { frames, final };
}

describe('one open call high-score search', () => {
  it.each(['pon','chi'] as const)('finds a legal haneman %s line and replays it', kind => {
    const { initial } = fixture(kind);
    const before = JSON.stringify(initial);
    const result = searchWithOneOpenCall(initial, null)!;
    expect(result?.bestScore).toBeGreaterThanOrEqual(12000);
    verify(initial, result);
    expect(JSON.stringify(initial)).toBe(before);
  });
  it('supports two-player pon', () => {
    const { initial } = fixture('pon', false);
    verify(initial, searchWithOneOpenCall(initial, null)!);
  });
  it('retains the closed baseline on an equal score', () => {
    const { initial } = fixture();
    const best = searchWithOneOpenCall(initial, null)!;
    const baseline = { ...best, line: [] };
    expect(searchWithOneOpenCall(initial, baseline)).toBe(baseline);
  });
  it('accepts cheap open wins without a closed win', () => {
    const { initial } = fixture('low');
    let stats: OpenSearchStats | undefined;
    const result = searchWithOneOpenCall(initial, null, 4000, s => { stats = s; })!;
    expect(result.bestScore).toBeGreaterThan(0);
    expect(result.bestScore).toBeLessThan(8000);
    expect(stats!.replayedLines).toBeGreaterThan(0);
    verify(initial,result);
  });
  it('cannot chi from a non-upstream seat', () => {
    const { initial } = fixture('chi');
    expect(searchWithOneOpenCall({ ...initial, nextSeat: 'west' }, null)).toBeNull();
  });
  it('uses the new draw cycle after calling', () => {
    const { initial, t } = fixture();
    const win = initial.wall[1];
    initial.wall = [initial.wall[0],t('pin',1),t('pin',2),t('pin',3),win,t('sou',1)];
    const result = searchWithOneOpenCall(initial, null)!;
    const { final } = verify(initial, result);
    expect(final.winType).toBe('tsumo');
    expect(final.winTile?.id).toBe(win.id);
    expect(final.wallDrawnCount).toBe(5);
  });
  it('returns the baseline at a zero time budget', () => {
    const { initial } = fixture();
    let stats: OpenSearchStats | undefined;
    expect(searchWithOneOpenCall(initial,null,0,s => { stats = s; })).toBeNull();
    expect(stats!.timeLimitReached).toBe(true);
    expect(stats!.targets).toBe(0);
  });
  it('retains the call tiles acquired before a later call', () => {
    const { initial, t } = fixture();
    const index = initial.playerHand.findIndex(t => t.suit === 'dragon' && t.value === 1);
    const acquired = initial.playerHand[index];
    initial.playerHand[index] = t('sou',8);
    const state = { ...initial, phase: 'playerDraw' as const, nextSeat: 'south' as const,
      wall: [acquired,t('pin',1),t('pin',2),...initial.wall] };
    const result = searchWithOneOpenCall(state,null)!;
    const { final } = verify(state as typeof initial, result);
    expect(final.playerFuro[0].tiles.some(t => t.id === acquired.id)).toBe(true);
    expect(result.line[0].type).toBe('draw');
  });
  it.each([20261016, 20261017])('measures a full four-player wall (seed %i)', seedValue => {
    const deck = createDeck();
    let seed = seedValue;
    for (let i = deck.length - 1; i > 0; i--) {
      seed = (Math.imul(seed,1664525) + 1013904223) >>> 0;
      const j = Math.floor(seed / 4294967296 * (i+1));
      [deck[i],deck[j]] = [deck[j],deck[i]];
    }
    const hand = sortHand(deck.splice(0,13));
    const opponents = deck.splice(0,39);
    const wanpai = deck.splice(0,14);
    const state = { ...makeInitialStateBase(hand,opponents.slice(0,13),deck,wanpai,'south','east'),
      mode: 'four' as const, nextSeat: 'east' as const, roundWind: 'east' as const };
    let stats: OpenSearchStats | undefined;
    const result = searchWithOneOpenCall(state,null,1500,s => { stats = s; });
    console.info('[one-open-call]', seedValue, stats, result?.bestScore ?? null);
    expect(stats!.callCandidates).toBeGreaterThan(0);
    expect(stats!.targets).toBe(stats!.prunedTargets + stats!.replayedLines);
    if (result) verify(state as ReturnType<typeof fixture>['initial'],result);
  });
  it('does not prune a mixed triple-triplet, three-concealed-triplet hand', () => {
    const { initial, t } = fixture('low');
    const counts = Array<number>(34).fill(0);
    counts[1] = counts[10] = counts[19] = 3; counts[4] = 2;
    const meld = [t('wind',3),t('wind',3),t('wind',3)];
    expect(openHanUpperBound(initial,counts,meld,[])).toBeGreaterThanOrEqual(6);
  });
});
