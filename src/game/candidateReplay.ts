import type { Tile } from '@/types';
import type { State } from '@/game/gameState';
import { sortHand } from '@/gameLogic';
import { analyzeSearchHand, type SearchContext } from '@/game/searchContext';
import { threePlayerScoreUpperBound } from '@/game/scoreUpperBound';
import { searchScoreCeiling } from '@/game/searchScoreCeiling';
import { drawStride, playerDrawOffset } from '@/game/seatFlow';
import { enumerateTenpaiCandidates, findCandidateWinOpportunities, type CandidateWinOpportunity } from '@/game/tenpaiCandidates';

export interface CandidateSearchStats { targets: number; prunedTargets: number; replayedOpportunities: number }
export interface CandidateSearchOptions {
  context?: SearchContext;
  minimumScore?: number;
  stats?: CandidateSearchStats;
}

function face(tile: Tile): number {
  const base = tile.suit === 'man' ? 0 : tile.suit === 'pin' ? 9 :
    tile.suit === 'sou' ? 18 : tile.suit === 'wind' ? 27 : 31;
  return base + tile.value - 1;
}

/** Same face-count difference for every discard ordering reaching this exact target. */
export function isTargetFuriten(
  initial: State, target: readonly number[], waits: readonly number[], wallIndex: number,
): boolean {
  const available = Array<number>(34).fill(0);
  for (const tile of initial.playerHand) available[face(tile)]++;
  const firstOwnIndex = playerDrawOffset(initial);
  for (let i = firstOwnIndex; i < wallIndex; i += drawStride(initial)) available[face(initial.wall[i])]++;
  return initial.playerDiscards.some(tile => waits.includes(face(tile))) ||
    waits.some(i => available[i] > target[i]);
}

export interface CandidateReplay {
  opportunity: CandidateWinOpportunity;
  /** Actual discard tiles in chronological player-draw order. */
  discards: Tile[];
  /** All wait faces visible in the player's river, if any. */
  furiten: boolean;
  /** Highest score from no-riichi or legal last-discard riichi + ippatsu. */
  score: number | null;
  riichi: boolean;
}

/**
 * Reconstruct one deterministic line by retaining target tiles and discarding
 * surplus tiles. This does not branch on arbitrary intermediary discards.
 * The solver remains closed-hand, no calls/no kans, from either opening seat.
 */
export function replayCandidateOpportunity(
  initial: State,
  opportunity: CandidateWinOpportunity,
  context?: SearchContext,
): CandidateReplay | null {
  if (!['playerDraw', 'cpuTurn'].includes(initial.phase) || initial.playerFuro.length ||
      initial.playerDrawnTile || initial.playerHand.length !== 13) return null;
  const firstOwnIndex = playerDrawOffset(initial);
  const stride = drawStride(initial);
  const target = opportunity.candidate.counts;
  const hand = [...initial.playerHand];
  // Prefer red fives whenever more copies of a face exist than the target needs.
  // The chronological retention rule below preserves already-held red copies.
  const discards: Tile[] = [];
  for (let i = firstOwnIndex; i < opportunity.wallIndex; i += stride) {
    if (context?.shouldStop()) return null;
    const drawn = initial.wall[i];
    const available = [...hand, drawn];
    const counts = Array<number>(34).fill(0);
    for (const tile of available) counts[face(tile)]++;
    // Never throw away a needed copy. If several surplus tiles exist, prefer
    // one that does not share a face with any eventual winning wait.
    const extra = [...available].reverse().filter(tile => counts[face(tile)] > target[face(tile)]);
    if (!extra.length) return null;
    const discard = extra.find(tile => !tile.isRed && !opportunity.candidate.waits.includes(face(tile))) ??
      extra.find(tile => !tile.isRed) ?? extra[0];
    discards.push(discard);
    available.splice(available.findIndex(tile => tile.id === discard.id), 1);
    // Match the displayed hand after each discard, including newly kept draws.
    hand.splice(0, hand.length, ...sortHand(available));
  }
  const actual = Array<number>(34).fill(0);
  for (const tile of hand) actual[face(tile)]++;
  if (!actual.every((n, i) => n === target[i])) return null;
  const furiten = isTargetFuriten(initial, target, opportunity.candidate.waits, opportunity.wallIndex);

  if (opportunity.type === 'ron' && furiten) {
    return { opportunity, discards, furiten, score: null, riichi: false };
  }
  const winningTile = initial.wall[opportunity.wallIndex];
  const winState: State = {
    ...initial,
    playerHand: hand,
    playerDrawnTile: null,
    playerDiscards: [...initial.playerDiscards, ...discards],
    phase: 'win',
    winType: opportunity.type,
    winTile: winningTile,
    winFromWind: opportunity.sourceWind,
    // Advance the wall through this win for accurate last-tile yaku flags.
    wall: initial.wall.slice(opportunity.wallIndex + 1),
    isIppatsu: false,
  };
  const evaluate = (riichi: boolean): number | null => {
    try {
      const result = analyzeSearchHand({ ...winState, isRiichi: riichi,
        isIppatsu: riichi && (!initial.isRiichi || initial.isIppatsu) }, context);
      return result?.valid && result.handInterpretations.length
        ? Math.max(...result.handInterpretations.map(h => h.totalWinnings))
        : null;
    } catch { return null; }
  };
  const without = evaluate(initial.isRiichi);
  // Last-moment riichi requires a previous discard with a future own draw,
  // and is not legal on the initial draw or after all own draws have passed.
  // The preceding discard must actually leave this exact 13-tile tenpai.
  // For ron this is the immediately preceding own discard; for tsumo the
  // preceding player draw/discard is two wall positions earlier.
  const lastDiscardWallIndex = firstOwnIndex + Math.floor((opportunity.wallIndex - 1 - firstOwnIndex) / stride) * stride;
  // Both preceding indices must actually be player-draw/discard turns.
  const previousHand = lastDiscardWallIndex >= firstOwnIndex ? (() => {
    const tiles = [...initial.playerHand];
    for (let i = firstOwnIndex; i <= lastDiscardWallIndex; i += stride) {
      tiles.push(initial.wall[i]);
      const discard = discards[(i - firstOwnIndex) / stride];
      if (!discard) return null;
      const idx = tiles.findIndex(t => t.id === discard.id);
      if (idx < 0) return null;
      tiles.splice(idx, 1);
    }
    return tiles;
  })() : null;
  const priorCounts = Array<number>(34).fill(0);
  if (previousHand) for (const tile of previousHand) priorCounts[face(tile)]++;
  const priorIsTenpai = previousHand !== null && priorCounts.every((n, i) => n === target[i]);
  // Last-discard riichi is legal only when an ensuing player draw remains;
  // the CPU's last discard still exists in player-first order.
  const canLateRiichi = !initial.isRiichi && priorIsTenpai &&
    // A riichi declaration needs at least one subsequent own draw available.
    // This excludes the player-first 18th CPU ron but permits CPU-first 18th ron.
    lastDiscardWallIndex + stride < initial.wall.length;
  const withRiichi = canLateRiichi ? evaluate(true) : null;
  const useRiichi = withRiichi !== null && (without === null || withRiichi > without);
  return { opportunity, discards, furiten,
    score: useRiichi ? withRiichi : without, riichi: useRiichi || initial.isRiichi };
}

export function evaluateCandidateWins(initial: State, options: CandidateSearchOptions = {}): CandidateReplay[] {
  const { context, minimumScore = -1, stats } = options;
  const ceiling = searchScoreCeiling(initial);
  if (minimumScore >= ceiling || context?.shouldStop()) return [];
  const candidates = enumerateTenpaiCandidates(initial, { shouldStop: context?.shouldStop });
  if (stats) stats.targets += candidates.length;
  const pool = [...initial.playerHand, ...initial.wall.filter((_, i) =>
    i % drawStride(initial) === playerDrawOffset(initial))];
  const opportunities = findCandidateWinOpportunities(initial, candidates, context?.shouldStop);
  const uses = new Map<CandidateWinOpportunity['candidate'], number>();
  for (const opportunity of opportunities) uses.set(opportunity.candidate, (uses.get(opportunity.candidate) ?? 0) + 1);
  const bounds = new Map<CandidateWinOpportunity['candidate'], number>();
  const retained = new Set<CandidateWinOpportunity['candidate']>();
  const replays: CandidateReplay[] = [];
  for (const opportunity of opportunities) {
    if (context?.shouldStop()) break;
    const target = opportunity.candidate;
    if (minimumScore >= 0) {
      if (opportunity.type === 'ron' && isTargetFuriten(initial,target.counts,target.waits,opportunity.wallIndex)) continue;
      // Matching the target to actual future winning tiles is cheaper than
      // scoring a synthetic upper bound. Only amortize that bound when it can
      // eliminate several chronological replays of the same target.
      if (initial.mode === 'three' && (uses.get(target) ?? 0) >= 4) {
        if (!bounds.has(target)) bounds.set(target, threePlayerScoreUpperBound(initial,target,pool,initial.wall,context));
        if (bounds.get(target)! <= minimumScore) continue;
      }
    }
    if (stats) stats.replayedOpportunities++;
    const replay = replayCandidateOpportunity(initial, opportunity, context);
    if (replay && (minimumScore < 0 || (replay.score ?? -1) > minimumScore)) {
      replays.push(replay); retained.add(target);
    }
  }
  if (stats) stats.prunedTargets += candidates.length - retained.size;
  return replays.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}
