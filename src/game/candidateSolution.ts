import type { State } from '@/game/gameState';
import type { SolverAction, SolverResult } from '@/game/solver';
import { evaluateCandidateWins, type CandidateReplay } from '@/game/candidateReplay';
import { buildSolverReplay } from '@/game/solverReplay';
import {
  applyPlayerDraw, applyCpuTurn, applyPlayerDiscard,
  applyPassTsumo, applyPassNaki,
} from '@/game/transitions';

/**
 * Candidate-first search. This is a feasible *lower bound*, not a proof of the
 * global maximum: candidateReplay uses one deterministic discard order per
 * target and only searches standard four-meld-and-pair waits.
 */
export function findCandidateSolution(initial: State): SolverResult | null {
  if (initial.playerFuro.length || initial.playerDrawnTile ||
      (initial.phase !== 'playerDraw' && initial.phase !== 'cpuTurn') ||
      initial.playerHand.length !== 13) return null;

  const started = Date.now();
  const candidates = evaluateCandidateWins(initial);
  for (const candidate of candidates
    .filter(c => c.score !== null)
    .sort((a, b) => (b.score! - a.score!) ||
      (a.opportunity.wallIndex - b.opportunity.wallIndex))) {
    const line = reconstruct(initial, candidate);
    if (!line) continue;
    const result: SolverResult = {
      supported: true, complete: false, outcome: 'win',
      bestScore: candidate.score, line,
      stats: { statesVisited: 0, cacheHits: 0, prunedBranches: 0,
        elapsedMs: Date.now() - started },
    };
    const frames = buildSolverReplay(initial, { ...result, complete: true });
    const finalFrame = frames[frames.length - 1];
    if (frames.length === line.length + 1 && finalFrame.state.phase === 'win') {
      return result;
    }
  }
  return null;
}

function reconstruct(initial: State, candidate: CandidateReplay): SolverAction[] | null {
  const line: SolverAction[] = [];
  let state = initial;
  let discardIndex = 0;
  const opportunity = candidate.opportunity;
  const winIndex = opportunity.wallIndex;

  for (let guard = 0; guard < 120; guard++) {
    if (state.wallDrawnCount === winIndex &&
        opportunity.type === 'tsumo' && state.phase === 'playerDraw') {
      const next = applyPlayerDraw(state);
      if (!next) return null;
      line.push({ type: 'draw' });
      state = next;
      line.push({ type: 'tsumo', riichi: candidate.riichi,
        lastMomentRiichi: candidate.riichi && !initial.isRiichi,
        score: candidate.score! });
      return line;
    }
    if (state.wallDrawnCount === winIndex &&
        opportunity.type === 'ron' && state.phase === 'cpuTurn') {
      const tile = state.wall[0];
      if (!tile) return null;
      const next = applyCpuTurn(state);
      if (!next) return null;
      line.push({ type: 'cpu-turn' });
      line.push({ type: 'ron', tile, riichi: candidate.riichi,
        lastMomentRiichi: candidate.riichi && !initial.isRiichi,
        score: candidate.score! });
      return line;
    }
    if (state.wallDrawnCount > winIndex) return null;
    if (state.phase === 'playerDraw') {
      const next = applyPlayerDraw(state);
      if (!next) return null;
      line.push({ type: 'draw' });
      state = next;
    } else if (state.phase === 'cpuTurn') {
      const next = applyCpuTurn(state);
      if (!next) return null;
      line.push({ type: 'cpu-turn' });
      state = next;
    } else if (state.phase === 'naki') {
      const next = applyPassNaki(state);
      if (!next) return null;
      line.push({ type: 'pass-naki' });
      state = next;
    } else if (state.phase === 'playerDiscard' && state.tsumoAvailable) {
      const next = applyPassTsumo(state);
      if (!next) return null;
      line.push({ type: 'pass-tsumo' });
      state = next;
    } else if (state.phase === 'playerDiscard') {
      const tile = candidate.discards[discardIndex++];
      if (!tile) return null;
      const next = applyPlayerDiscard(state, tile);
      if (!next) return null;
      line.push({ type: 'discard', tile, riichi: candidate.riichi && !initial.isRiichi && discardIndex === candidate.discards.length });
      state = next;
    } else return null;
  }
  return null;
}
