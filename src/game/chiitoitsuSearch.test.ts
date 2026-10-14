import { describe, expect, it } from 'vitest';
import type { Tile } from '@/types';
import { makeInitialStateBase } from '@/game/gameState';
import { enumerateTenpaiCandidates, findCandidateWinOpportunities } from '@/game/tenpaiCandidates';
import { evaluateCandidateWins } from '@/game/candidateReplay';
import { findCandidateSolution } from '@/game/candidateSolution';
import { buildSolverReplay } from '@/game/solverReplay';
import { scoreHand } from '@/game/scoreAdapter';

const tile = (face: number, id: string, isRed = false): Tile => ({
  suit: face < 9 ? 'man' : face < 18 ? 'pin' : face < 27 ? 'sou' : face < 31 ? 'wind' : 'dragon',
  value: face < 27 ? face % 9 + 1 : face < 31 ? face - 26 : face - 30,
  id, isRed,
});
const faces = [0, 3, 6, 9, 12, 22];
const last = <T,>(items: T[]): T => items[items.length - 1];
const hand = () => [...faces.flatMap(f => [tile(f, `${f}-a`, f === 22), tile(f, `${f}-b`)]), tile(27, 'east')];
const counts = (tiles: Tile[]) => {
  const result = Array<number>(34).fill(0);
  for (const t of tiles) {
    const base = t.suit === 'man' ? 0 : t.suit === 'pin' ? 9 : t.suit === 'sou' ? 18 : t.suit === 'wind' ? 27 : 31;
    result[base + t.value - 1]++;
  }
  return result;
};
const initial = (tiles = hand(), wall: Tile[] = []) =>
  makeInitialStateBase(tiles, [], wall, [], 'east', 'south');
const isSevenPairsTenpai = (c: number[]) =>
  c.filter(n => n === 2).length === 6 && c.filter(n => n === 1).length === 1 && c.every(n => n <= 2);

describe('seven-pairs candidate search', () => {
  it('finds six distinct pairs and a singleton without mutating the deal', () => {
    const state = initial();
    const before = JSON.stringify(state);
    const candidate = enumerateTenpaiCandidates(state).find(c => c.counts.join() === counts(state.playerHand).join());
    expect(candidate?.waits).toEqual([27]);
    expect(candidate?.earliestPlayerDraw).toBe(0);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('does not count four identical tiles as two pairs', () => {
    const tiles = [0, 0, 0, 0, 9, 9, 12, 12, 18, 18, 22, 22, 27].map((f, i) => tile(f, `quad-${i}`));
    expect(enumerateTenpaiCandidates(initial(tiles))).toEqual([]);
  });

  it('deduplicates overlap with standard hands and preserves every standard wait', () => {
    const tiles = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6].map((f, i) => tile(f, `overlap-${i}`));
    const candidates = enumerateTenpaiCandidates(initial(tiles));
    expect(candidates).toHaveLength(1);
    expect(candidates[0].waits).toEqual([0, 3, 6]);
  });

  it('only obtains a missing pair tile from player draws, before the winning tile', () => {
    const tiles = hand();
    tiles[11] = tile(31, 'surplus');
    const state = initial(tiles, [tile(22, 'needed'), tile(27, 'ron'), tile(1, 'later')]);
    const target = counts(hand());
    const candidate = enumerateTenpaiCandidates(state).find(c => c.counts.join() === target.join());
    expect(candidate?.earliestPlayerDraw).toBe(1);
    expect(findCandidateWinOpportunities(state, candidate ? [candidate] : [])
      .map(o => [o.type, o.wallIndex])).toEqual([['ron', 1]]);
    const cpuOnly = initial(tiles, [tile(1, 'own'), tile(22, 'cpu-needed')]);
    expect(enumerateTenpaiCandidates(cpuOnly).some(c => c.counts.join() === target.join())).toBe(false);
    const tooLate = initial(tiles, [tile(27, 'early-win'), tile(1, 'cpu'), tile(22, 'late-needed')]);
    expect(findCandidateWinOpportunities(tooLate, enumerateTenpaiCandidates(tooLate)
      .filter(c => c.counts.join() === target.join()))).toEqual([]);
  });

  it('matches an independent small-pool subset oracle, with red/normal fives sharing a face', () => {
    const state = initial(hand(), [tile(27, 'second-east'), tile(1, 'cpu-only'), tile(31, 'white'), tile(2, 'cpu-only2')]);
    const pool = [...state.playerHand, state.wall[0], state.wall[2]];
    const expected = new Set<string>();
    // Choose 13 physical tiles independently of the structured generator.
    for (let a = 0; a < pool.length; a++) for (let b = a + 1; b < pool.length; b++) {
      const c = counts(pool.filter((_, i) => i !== a && i !== b));
      if (isSevenPairsTenpai(c)) expected.add(c.join());
    }
    const actual = enumerateTenpaiCandidates(state).filter(c => isSevenPairsTenpai(c.counts));
    expect(new Set(actual.map(c => c.counts.join()))).toEqual(expected);
    for (const c of actual) expect(c.waits).toEqual([c.counts.indexOf(1)]);
  });

  it('excludes open hands', () => {
    const called = tile(0, 'called');
    const state = { ...initial(), playerFuro: [{ type: 'pung' as const,
      tiles: [called, tile(0, 'pon2'), tile(0, 'pon3')], calledTile: called }] };
    expect(enumerateTenpaiCandidates(state)).toEqual([]);
  });
});

describe('seven-pairs scoring and chronological replay', () => {
  for (const playerFirst of [true, false]) for (const winType of ['ron', 'tsumo'] as const) {
    it(`scores and replays ${playerFirst ? 'player-first' : 'CPU-first'} ${winType}`, () => {
      const wall = winType === 'ron'
        ? playerFirst ? [tile(31, 'discard'), tile(27, 'win')] : [tile(27, 'win')]
        : playerFirst ? [tile(27, 'win')] : [tile(31, 'cpu'), tile(27, 'win')];
      const state = { ...initial(hand(), wall), phase: playerFirst ? 'playerDraw' as const : 'cpuTurn' as const };
      const before = JSON.stringify(state);
      const result = findCandidateSolution(state);
      expect(result?.outcome).toBe('win');
      expect(result?.complete).toBe(false); // A feasible score, not a proven global optimum.
      expect(last(result!.line).type).toBe(winType);
      const frames = buildSolverReplay(state, result!);
      expect(frames).toHaveLength(result!.line.length + 1);
      const final = last(frames).state;
      expect(final.phase).toBe('win');
      const score = scoreHand(final)!;
      expect(score.valid).toBe(true);
      expect(score.handInterpretations.some(h => h.yaku.some(y => y.name === 'chiitoitsu'))).toBe(true);
      expect(score.handInterpretations.some(h => h.fu === 25)).toBe(true);
      expect(Math.max(...score.handInterpretations.map(h => h.totalWinnings))).toBe(result?.bestScore);
      expect(final.playerHand.some(t => t.id === '22-a' && t.isRed)).toBe(true);
      expect(JSON.stringify(state)).toBe(before);
    });
  }

  it('blocks furiten ron but permits later tsumo', () => {
    const state = { ...initial(hand(), [tile(31, 'discard'), tile(27, 'ron'), tile(27, 'tsumo')]),
      playerDiscards: [tile(27, 'past-east')] };
    const wins = evaluateCandidateWins(state);
    expect(wins.find(r => r.opportunity.wallIndex === 1)?.score).toBeNull();
    expect(wins.find(r => r.opportunity.wallIndex === 2)?.score).toBeGreaterThan(0);
    expect(last(findCandidateSolution(state)!.line).type).toBe('tsumo');
  });

  it('uses the combined standard wait set for furiten on an overlapping shape', () => {
    const tiles = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6].map((f, i) => tile(f, `mixed-${i}`));
    const state = { ...initial(tiles, [tile(31, 'discard'), tile(6, 'ron')]),
      playerDiscards: [tile(0, 'standard-wait')] };
    const result = evaluateCandidateWins(state).find(r => r.opportunity.wallIndex === 1);
    expect(result?.furiten).toBe(true);
    expect(result?.score).toBeNull();
  });

  it('compares seven pairs and standard interpretations through the existing scorer', () => {
    const tiles = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6].map((f, i) => tile(f, `both-${i}`));
    const state = initial(tiles, [tile(6, 'win')]);
    const result = findCandidateSolution(state)!;
    const final = last(buildSolverReplay(state, result)).state;
    const interpretations = scoreHand(final)!.handInterpretations;
    expect(interpretations.some(h => h.yaku.some(y => y.name === 'chiitoitsu'))).toBe(true);
    expect(interpretations.some(h => !h.yaku.some(y => y.name === 'chiitoitsu'))).toBe(true);
    expect(result.bestScore).toBe(Math.max(...interpretations.map(h => h.totalWinnings)));
  });

  it('retains red fives, declares last-moment riichi and reconstructs the new pair', () => {
    const tiles = hand();
    tiles[11] = tile(31, 'surplus');
    const state = initial(tiles, [tile(22, 'needed'), tile(27, 'ron'), tile(1, 'future-own')]);
    const result = findCandidateSolution(state)!;
    expect(result.outcome).toBe('win');
    expect(result.line.some(a => a.type === 'discard' && a.tile.id === 'surplus' && a.riichi)).toBe(true);
    const final = last(buildSolverReplay(state, result)).state;
    expect(final.isRiichi).toBe(true);
    expect(final.isIppatsu).toBe(true);
    expect(final.playerHand.some(t => t.id === '22-a' && t.isRed)).toBe(true);
    expect(Math.max(...scoreHand(final)!.handInterpretations.map(h => h.totalWinnings))).toBe(result.bestScore);
  });
});
