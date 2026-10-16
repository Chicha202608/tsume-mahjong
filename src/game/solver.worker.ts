import { findBestNoKanSolution } from '@/game/drawSolution';
import type { State } from '@/game/gameState';
import type { SolverResult } from '@/game/solver';
import { searchWithAnkan } from '@/game/ankanSearch';

/**
 * First publish the no-kan target search, then compare up to two ankan.
 * Both use chronological legal play rather than the older all-discard DP.
 *
 * Candidate enumeration covers standard hands, seven pairs and kokushi, and its replay
 * selects a deterministic discard order per target. Therefore a found
 * score is a lower bound, not a mathematically certified maximum.
 */
self.onmessage = (event: MessageEvent<State>) => {
  try {
    const candidate = findBestNoKanSolution(event.data);
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
    self.postMessage({ result, preliminary: true });
    let latest = result;
    try {
      const final = searchWithAnkan(event.data, result, 8000, 2,
        progress => {
          latest = progress ?? latest;
          self.postMessage({ result: latest, preliminary: true });
        });
      self.postMessage({ result: final ?? latest, preliminary: false });
    } catch {
      // An optional kan search must not discard the already available answer.
      self.postMessage({ result: latest, preliminary: false });
    }
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
