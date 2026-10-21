import type { Tile } from '@/types';
import type { State } from '@/game/gameState';
import type { SolverAction, SolverResult } from '@/game/solver';
import { enumerateTenpaiCandidates } from '@/game/tenpaiCandidates';
import { drawSettlement, TENPAI_DRAW_POINTS } from '@/game/drawSettlement';
import { findCandidateSolution } from '@/game/candidateSolution';
import { buildNotenReplay } from '@/game/solverReplay';
import { applyPlayerDraw, applyCpuTurn, applyPassNaki, applyPassTsumo, applyPlayerDiscard } from '@/game/transitions';
import type { CandidateSearchOptions } from '@/game/candidateReplay';
import type { SearchContext } from '@/game/searchContext';

const face = (t: Tile) => (t.suit === 'man' ? 0 : t.suit === 'pin' ? 9 : t.suit === 'sou' ? 18 : t.suit === 'wind' ? 27 : 31) + t.value - 1;

export function findBestNoKanSolution(initial: State, options: CandidateSearchOptions = {}): SolverResult | null {
  const win = findCandidateSolution(initial, options);
  if ((win?.bestScore ?? -1) >= TENPAI_DRAW_POINTS) return win;
  if ((options.minimumScore ?? -1) >= TENPAI_DRAW_POINTS || options.context?.shouldStop()) return win;
  const draw = findDrawSolution(initial, options.context);
  return draw && draw.bestScore! > (win?.bestScore ?? -1) ? draw : win;
}

/** Retain a reachable tenpai target through the last draw, declining all wins. */
export function findDrawSolution(initial: State, context?: SearchContext): SolverResult | null {
  if (context?.shouldStop()) return null;
  const started = Date.now();
  const result = (state: State, line: SolverAction[]): SolverResult | null => {
    const settlement = drawSettlement(state);
    if (!settlement) return null;
    return { supported: true, complete: false, outcome: settlement.tenpai ? 'tenpai' : 'noten',
      bestScore: settlement.score, line,
      stats: { statesVisited: line.length, cacheHits: 0, prunedBranches: 0, elapsedMs: Date.now() - started } };
  };
  const fallback = buildNotenReplay(initial);
  const fallbackResult = result(fallback[fallback.length - 1].state,
    fallback.flatMap(frame => frame.action ? [frame.action] : []));
  if (fallbackResult?.outcome === 'tenpai') return fallbackResult;
  if (initial.playerDrawnTile || !['playerDraw', 'cpuTurn'].includes(initial.phase)) return fallbackResult;

  for (const target of enumerateTenpaiCandidates(initial, { shouldStop: context?.shouldStop })) {
    if (context?.shouldStop()) break;
    let state = initial;
    const line: SolverAction[] = [];
    for (let guard = 0; guard < 320 && state.phase !== 'exhausted'; guard++) {
      if (context?.shouldStop()) break;
      let next: State | null = null;
      let action: SolverAction;
      if (state.phase === 'playerDraw') {
        action = { type: 'draw' }; next = applyPlayerDraw(state, context?.baseScores);
      } else if (state.phase === 'cpuTurn') {
        action = { type: 'cpu-turn' }; next = applyCpuTurn(state, context?.baseScores);
      } else if (state.phase === 'naki') {
        action = { type: 'pass-naki' }; next = applyPassNaki(state);
      } else if (state.phase === 'playerDiscard' && state.tsumoAvailable) {
        action = { type: 'pass-tsumo' }; next = applyPassTsumo(state);
      } else if (state.phase === 'playerDiscard' && state.playerDrawnTile) {
        const available = [...state.playerHand, state.playerDrawnTile];
        const counts = Array<number>(34).fill(0);
        for (const tile of available) counts[face(tile)]++;
        const extra = [...available].reverse().filter(t => counts[face(t)] > target.counts[face(t)] &&
          (!state.isRiichi || t.id === state.playerDrawnTile!.id));
        const tile = extra.find(t => !t.isRed) ?? extra[0];
        if (!tile) break;
        action = { type: 'discard', tile }; next = applyPlayerDiscard(state, tile);
      } else break;
      if (!next) break;
      state = next; line.push(action);
    }
    const candidate = result(state, line);
    if (candidate?.outcome === 'tenpai') return candidate;
  }
  return fallbackResult;
}
