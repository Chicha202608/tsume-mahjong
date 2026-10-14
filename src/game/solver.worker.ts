import { findCandidateSolution } from '@/game/candidateSolution';
import type { State } from '@/game/gameState';
import type { SolverResult } from '@/game/solver';

/**
 * Normal-hand solver path: enumerate tenpai targets, materialize legal
 * chronological wins and compare their scores. Do not run the older
 * all-discard-branches DP after this search.
 *
 * Candidate enumeration covers standard hands and seven pairs, and its replay
 * selects a deterministic discard order per target. Therefore a found
 * score is a lower bound, not a mathematically certified maximum.
 */
self.onmessage = (event: MessageEvent<State>) => {
  try {
    const candidate = findCandidateSolution(event.data);
    const result: SolverResult = candidate ?? {
      supported: true,
      complete: false,
      outcome: null,
      bestScore: null,
      line: [],
      stats: {
        statesVisited: 0,
        cacheHits: 0,
        prunedBranches: 0,
        elapsedMs: 0,
      },
    };
    self.postMessage({ result, preliminary: false });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
