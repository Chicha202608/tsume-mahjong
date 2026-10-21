import { findBestNoKanSolution } from '@/game/drawSolution';
import type { State } from '@/game/gameState';
import type { SolverResult } from '@/game/solver';
import { searchWithAnkan } from '@/game/ankanSearch';
import { searchWithNuki, searchWithOpenCalls } from '@/game/openSearch';
import { createSearchContext } from '@/game/searchContext';

/**
 * In three-player mode, first fix the eager north-extraction schedule and
 * enumerate its targets once. Publish that baseline before the retained-north
 * and kan searches, and use it to prune the later mixed-call search.
 * Other modes publish the no-kan target search, compare up to two ankan, then up to four
 * fixed melds mixing open calls, ankan and kakan upgrades (up to eight operations).
 * Open hands strictly beat the closed line; sub-mangan closed results also
 * allow a fallback search for open wins below haneman.
 * Each stage uses chronological legal play rather than the older all-discard DP.
 *
 * Candidate enumeration covers standard hands, seven pairs and kokushi, and its replay
 * selects a deterministic discard order per target. Therefore a found
 * score is a lower bound, not a mathematically certified maximum.
 */
self.onmessage = (event: MessageEvent<State>) => {
  const deadline = Date.now() + 60000;
  const context = createSearchContext(deadline);
  const remainingMs = () => Math.max(0, deadline - Date.now());
  let latest: SolverResult = {
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
  const publish = (result: SolverResult | null) => {
    latest = result ?? latest;
    self.postMessage({ result: latest, preliminary: true });
  };
  try {
    if (event.data.mode === 'three') {
      publish(searchWithNuki(event.data, null, Math.min(6000, remainingMs()), undefined, publish, context));
    }
    if (context.shouldStop()) { self.postMessage({ result: latest, preliminary: false }); return; }
    const candidate = findBestNoKanSolution(event.data, { context,
      minimumScore: event.data.mode === 'three' ? latest.bestScore ?? -1 : -1 });
    if (candidate && (candidate.bestScore ?? -1) > (latest.bestScore ?? -1)) latest = candidate;
    publish(latest);
    if (context.shouldStop()) { self.postMessage({ result: latest, preliminary: false }); return; }
    try {
      const final = searchWithAnkan(event.data, latest, Math.min(8000, remainingMs()), 2, publish, context);
      latest = final ?? latest;
      self.postMessage({ result: latest, preliminary: true });
      if (context.shouldStop()) { self.postMessage({ result: latest, preliminary: false }); return; }
      latest = searchWithOpenCalls(event.data, latest, remainingMs(), 4, undefined, progress => {
        latest = progress ?? latest;
        self.postMessage({ result: latest, preliminary: true });
      }, 'all', context) ?? latest;
      self.postMessage({ result: latest, preliminary: false });
    } catch {
      // An optional kan search must not discard the already available answer.
      self.postMessage({ result: latest, preliminary: false });
    }
  } catch (error) {
    if (latest.bestScore !== null) self.postMessage({ result: latest, preliminary: false });
    else self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
