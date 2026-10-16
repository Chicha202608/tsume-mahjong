import type { Tile } from '@/types';
import type { State } from '@/game/gameState';
import { scoreHand } from '@/game/scoreAdapter';
import { drawStride, playerDrawOffset } from '@/game/seatFlow';
import { enumerateTenpaiCandidates, findCandidateWinOpportunities, type CandidateWinOpportunity } from '@/game/tenpaiCandidates';

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
    const drawn = initial.wall[i];
    const available = [...hand, drawn];
    const counts = Array<number>(34).fill(0);
    for (const tile of available) counts[face(tile)]++;
    // Never throw away a needed copy. If several surplus tiles exist, prefer
    // one that does not share a face with any eventual winning wait.
    const extra = available.filter(tile => counts[face(tile)] > target[face(tile)]);
    if (!extra.length) return null;
    const discard = extra.find(tile => !tile.isRed && !opportunity.candidate.waits.includes(face(tile))) ??
      extra.find(tile => !tile.isRed) ?? extra[0];
    discards.push(discard);
    available.splice(available.findIndex(tile => tile.id === discard.id), 1);
    hand.splice(0, hand.length, ...available);
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
      const result = scoreHand({ ...winState, isRiichi: riichi,
        isIppatsu: riichi && (!initial.isRiichi || initial.isIppatsu) });
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
  const previousOwnTurn = lastDiscardWallIndex >= firstOwnIndex
    ? (lastDiscardWallIndex - firstOwnIndex) / stride + 1 : 0;
  const canLateRiichi = !initial.isRiichi && priorIsTenpai &&
    previousOwnTurn < 18 &&
    // A riichi declaration needs at least one subsequent own draw available.
    // This excludes the player-first 18th CPU ron but permits CPU-first 18th ron.
    lastDiscardWallIndex + stride < initial.wall.length;
  const withRiichi = canLateRiichi ? evaluate(true) : null;
  const useRiichi = withRiichi !== null && (without === null || withRiichi > without);
  return { opportunity, discards, furiten,
    score: useRiichi ? withRiichi : without, riichi: useRiichi || initial.isRiichi };
}

export function evaluateCandidateWins(initial: State): CandidateReplay[] {
  const candidates = enumerateTenpaiCandidates(initial);
  return findCandidateWinOpportunities(initial, candidates)
    .map(opportunity => replayCandidateOpportunity(initial, opportunity))
    .filter((replay): replay is CandidateReplay => replay !== null)
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}
