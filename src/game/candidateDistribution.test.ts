import { describe, expect, it } from 'vitest';
import { createDeck } from '@/gameLogic';
import { makeInitialStateBase } from '@/game/gameState';
import { enumerateTenpaiCandidates, findCandidateWinOpportunities } from '@/game/tenpaiCandidates';
import { evaluateCandidateWins } from '@/game/candidateReplay';

function drawSeeded<T>(items: T[], seed: number, needed: number): T[] {
  let x = seed >>> 0;
  const next = () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296);
  const out = [...items];
  // Only sample the tiles used by this no-kan solver: 13 starting tiles,
  // 36 wall tiles, 1 visible dora indicator and 1 ura indicator.
  // Unseen CPU/dead-wall tiles need no order or identity.
  for (let i = 0; i < needed; i++) {
    const j = i + Math.floor(next() * (out.length - i));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, needed);
}
function stats(items: number[]) {
  const sorted = [...items].sort((a, b) => a - b);
  const sum = items.reduce((a, b) => a + b, 0);
  return { mean: Math.round(sum / items.length * 10) / 10,
    median: (sorted[(items.length - 1) >> 1] + sorted[items.length >> 1]) / 2,
    min: sorted[0], max: sorted[sorted.length - 1] };
}

describe('partial-draw 36-tile wall sampling', () => {
  it('reports the distribution over 100 distinct reproducible random deals', () => {
    const n = 100;
    const shapeCounts: number[] = [];
    const opportunityShapeCounts: number[] = [];
    const positiveShapeCounts: number[] = [];
    const legalWinCounts: number[] = [];
    const runTimes: number[] = [];
    let noWin = 0;
    for (let k = 0; k < n; k++) {
      const sampled = drawSeeded(createDeck(), 20261014 + k * 7919, 51);
      const hand = sampled.slice(0, 13);
      const wall = sampled.slice(13, 49);
      // Scoring reads only wanpai[4] (dora) and wanpai[9] (ura).
      const dead = Array<typeof hand[number]>(10);
      dead[4] = sampled[49];
      dead[9] = sampled[50];
      const state = {
        ...makeInitialStateBase(hand, [], wall, dead),
        roundWind: 'east' as const, playerWind: 'south' as const,
      };
      const began = Date.now();
      const candidates = enumerateTenpaiCandidates(state);
      const opportunities = findCandidateWinOpportunities(state, candidates);
      const evaluated = evaluateCandidateWins(state);
      const legal = evaluated.filter(v => v.score !== null);
      const distinct = (xs: Array<{opportunity:{candidate:{counts:number[]}}}>) =>
        new Set(xs.map(v => v.opportunity.candidate.counts.join(','))).size;
      shapeCounts.push(candidates.length);
      opportunityShapeCounts.push(new Set(opportunities.map(v => v.candidate.counts.join(','))).size);
      positiveShapeCounts.push(distinct(legal));
      legalWinCounts.push(legal.length);
      runTimes.push(Date.now() - began);
      if (!legal.length) noWin++;
    }
    console.info('[100 partial-draw 36-wall distribution]', {
      seeds: n,
      tenpaiShapes: stats(shapeCounts),
      shapesWithChronologicalOpportunity: stats(opportunityShapeCounts),
      shapesWithPositiveLegalWin: stats(positiveShapeCounts),
      positiveWinOpportunities: stats(legalWinCounts),
      elapsedMsPerDeal: stats(runTimes),
      dealsWithoutWinningLine: noWin,
      samples: { tenpaiShapes: shapeCounts,
        opportunities: opportunityShapeCounts, actualWinningShapes: positiveShapeCounts },
    });
    expect(shapeCounts).toHaveLength(n);
    expect(positiveShapeCounts.every((v, i) => v <= opportunityShapeCounts[i] &&
      opportunityShapeCounts[i] <= shapeCounts[i])).toBe(true);
  }, 240_000);
});
