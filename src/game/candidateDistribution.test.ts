import { describe, expect, it } from 'vitest';
import { createDeck } from '@/gameLogic';
import { makeInitialStateBase } from '@/game/gameState';
import { enumerateTenpaiCandidates, findCandidateWinOpportunities } from '@/game/tenpaiCandidates';
import { evaluateCandidateWins } from '@/game/candidateReplay';

function shuffleSeeded<T>(items: T[], seed: number): T[] {
  let x = seed >>> 0;
  const next = () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
function stats(items: number[]) {
  const sorted = [...items].sort((a, b) => a - b);
  const sum = items.reduce((a, b) => a + b, 0);
  return { mean: Math.round(sum / items.length * 10) / 10,
    median: (sorted[(items.length - 1) >> 1] + sorted[items.length >> 1]) / 2,
    min: sorted[0], max: sorted[sorted.length - 1] };
}

describe('fully shuffled 36-tile wall sampling', () => {
  it('reports the distribution over 24 distinct reproducible random deals', () => {
    const n = 24;
    const shapeCounts: number[] = [];
    const opportunityShapeCounts: number[] = [];
    const positiveShapeCounts: number[] = [];
    const legalWinCounts: number[] = [];
    const runTimes: number[] = [];
    let noWin = 0;
    for (let k = 0; k < n; k++) {
      const deck = shuffleSeeded(createDeck(), 20261014 + k * 7919);
      const hand = deck.slice(0, 13);
      const cpu = deck.slice(13, 26);
      const dead = deck.slice(26, 40);
      const wall = deck.slice(40, 76);
      const state = {
        ...makeInitialStateBase(hand, cpu, wall, dead),
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
      opportunityShapeCounts.push(distinct(opportunities));
      positiveShapeCounts.push(distinct(legal));
      legalWinCounts.push(legal.length);
      runTimes.push(Date.now() - began);
      if (!legal.length) noWin++;
    }
    console.info('[24 full-shuffle 36-wall distribution]', {
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
  }, 180_000);
});
