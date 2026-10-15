import { describe, expect, it } from 'vitest';
import type { Tile } from '@/types';
import { makeInitialStateBase } from '@/game/gameState';
import { enumerateTenpaiCandidates } from '@/game/tenpaiCandidates';
import { evaluateCandidateWins } from '@/game/candidateReplay';
import { findCandidateSolution } from '@/game/candidateSolution';
import { buildSolverReplay } from '@/game/solverReplay';
import { scoreHand } from '@/game/scoreAdapter';

const orphans = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
const tile = (face: number, id: string): Tile => ({
  suit: face < 9 ? 'man' : face < 18 ? 'pin' : face < 27 ? 'sou' : face < 31 ? 'wind' : 'dragon',
  value: face < 27 ? face % 9 + 1 : face < 31 ? face - 26 : face - 30,
  id,
});
const hand = (faces = orphans) => faces.map((face, i) => tile(face, `hand-${i}`));
const initial = (faces = orphans, wall: Tile[] = []) =>
  makeInitialStateBase(hand(faces), [], wall, [], 'east', 'south');

describe('kokushi candidate search', () => {
  it('enumerates all thirteen waits without mutating the state', () => {
    const state = initial();
    const before = JSON.stringify(state);
    const candidates = enumerateTenpaiCandidates(state);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].waits).toEqual(orphans);
    expect(candidates[0].earliestPlayerDraw).toBe(0);
    expect(JSON.stringify(state)).toBe(before);
  });

  it.each(orphans)('finds the single missing face %i', missing => {
    const faces = [...orphans.filter(f => f !== missing), missing === 0 ? 8 : 0];
    const candidates = enumerateTenpaiCandidates(initial(faces));
    expect(candidates).toHaveLength(1);
    expect(candidates[0].waits).toEqual([missing]);
  });

  for (const thirteenWait of [false, true]) {
    for (const playerFirst of [false, true]) {
      for (const winType of ['ron', 'tsumo'] as const) {
        it(`scores and replays ${thirteenWait ? 'thirteen' : 'single'} wait, playerFirst=${playerFirst}, ${winType}`, () => {
          const faces = thirteenWait ? orphans : [...orphans.filter(f => f !== 33), 0];
          const winningFace = thirteenWait ? 0 : 33;
          const wall = winType === 'ron'
            ? playerFirst ? [tile(4, 'discard'), tile(winningFace, 'win')] : [tile(winningFace, 'win')]
            : playerFirst ? [tile(winningFace, 'win')] : [tile(4, 'cpu'), tile(winningFace, 'win')];
          const state = { ...initial(faces, wall), phase: playerFirst ? 'playerDraw' as const : 'cpuTurn' as const };
          const result = findCandidateSolution(state)!;
          expect(result?.outcome).toBe('win');
          expect(result.line[result.line.length - 1].type).toBe(winType);
          const frames = buildSolverReplay(state, result);
          expect(frames).toHaveLength(result.line.length + 1);
          const final = frames[frames.length - 1].state;
          expect(final.phase).toBe('win');
          const scored = scoreHand(final)!;
          expect(scored.valid).toBe(true);
          expect(scored.handInterpretations.some(h => h.yaku.some(y => y.name.toLowerCase().includes('kokushi')))).toBe(true);
          expect(result.bestScore).toBe(Math.max(...scored.handInterpretations.map(h => h.totalWinnings)));
          expect(result.bestScore).toBeGreaterThanOrEqual(32000);
        });
      }
    }
  }

  it('builds the target using a future own draw, but not a CPU-only tile', () => {
    const faces = [...orphans.filter(f => f !== 33), 4];
    const state = initial(faces, [tile(33, 'needed'), tile(0, 'ron')]);
    const result = findCandidateSolution(state)!;
    expect(result?.outcome).toBe('win');
    expect(result.line.some(a => a.type === 'discard' && a.tile.value === 5 && a.tile.suit === 'man')).toBe(true);
    expect(findCandidateSolution(initial(faces, [tile(4, 'own'), tile(33, 'cpu-only')]))).toBeNull();
  });

  it('blocks thirteen-wait furiten ron and allows the later tsumo', () => {
    const state = { ...initial(orphans, [tile(4, 'discard'), tile(0, 'ron'), tile(8, 'tsumo')]),
      playerDiscards: [tile(33, 'past-discard')] };
    const wins = evaluateCandidateWins(state);
    expect(wins.find(w => w.opportunity.wallIndex === 1)?.score).toBeNull();
    expect(wins.find(w => w.opportunity.wallIndex === 2)?.score).toBeGreaterThan(0);
    const result = findCandidateSolution(state)!;
    expect(result.line[result.line.length - 1].type).toBe('tsumo');
  });
});
