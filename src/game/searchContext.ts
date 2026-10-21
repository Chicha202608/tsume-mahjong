import type { State } from '@/game/gameState';
import { buildHandInput, handInputCacheKey, scoreHand, type ScoredHandAnalysis, type BaseScoreCache } from '@/game/scoreAdapter';

/** One deal's search stages share a deadline and bounded, history-independent scoring cache. */
export interface SearchContext {
  deadline: number;
  shouldStop: () => boolean;
  scores: Map<string, ScoredHandAnalysis | null>;
  baseScores: BaseScoreCache;
  stats: { scoreRequests: number; scoreComputations: number; scoreCacheHits: number; readonly baseCacheHits: number; readonly baseComputations: number };
}

export function createSearchContext(deadline: number): SearchContext {
  const baseScores: BaseScoreCache = Object.assign(new Map(), { cacheHits: 0, computations: 0 });
  return { deadline, shouldStop: () => Date.now() >= deadline, scores: new Map(), baseScores,
    stats: { scoreRequests: 0, scoreComputations: 0, scoreCacheHits: 0,
      get baseCacheHits() { return baseScores.cacheHits ?? 0; },
      get baseComputations() { return baseScores.computations ?? 0; } } };
}

/** Cached results are read-only to callers. Physical tile IDs do not affect scoring. */
export function analyzeSearchHand(state: State, context?: SearchContext): ScoredHandAnalysis | null {
  if (!context) return scoreHand(state);
  context.stats.scoreRequests++;
  const input = buildHandInput(state);
  if (!input) return null;
  // buildHandInput contains the winds, meld sources, red fives, indicators and
  // situational flags. Extracted north is outside that input and must be keyed separately.
  const key = `${state.mode ?? 'two'}:${state.playerNuki?.length ?? 0}:${handInputCacheKey(input)}`;
  if (context.scores.has(key)) {
    context.stats.scoreCacheHits++;
    return context.scores.get(key)!;
  }
  context.stats.scoreComputations++;
  const result = scoreHand(state, context.baseScores);
  if (context.scores.size >= 4096) {
    const oldest = context.scores.keys().next().value;
    if (oldest !== undefined) context.scores.delete(oldest);
  }
  context.scores.set(key, result);
  return result;
}
