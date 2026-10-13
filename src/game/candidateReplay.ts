import type { Tile } from '@/types';
import type { State } from '@/game/gameState';
import { scoreHand } from '@/game/scoreAdapter';
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
  for (let i = 0; i < wallIndex; i += 2) available[face(initial.wall[i])]++;
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
 * The solver remains closed-hand, no calls/no kans, playerDraw start only.
 */
export function replayCandidateOpportunity(
  initial: State,
  opportunity: CandidateWinOpportunity,
): CandidateReplay | null {
  if (initial.phase !== 'playerDraw' || initial.playerFuro.length ||
      initial.playerDrawnTile || initial.playerHand.length !== 13) return null;
  const target = opportunity.candidate.counts;
  const hand = [...initial.playerHand];
  const discards: Tile[] = [];
  for (let i = 0; i < opportunity.wallIndex; i++) {
    if (i % 2) continue; // CPU draws and immediately discards.
    const drawn = initial.wall[i];
    const available = [...hand, drawn];
    const counts = Array<number>(34).fill(0);
    for (const tile of available) counts[face(tile)]++;
    // Never throw away a needed copy. If several surplus tiles exist, prefer
    // one that does not share a face with any eventual winning wait.
    const extra = available.filter(tile => counts[face(tile)] > target[face(tile)]);
    if (!extra.length) return null;
    const discard = extra.find(tile => !opportunity.candidate.waits.includes(face(tile))) ?? extra[0];
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
    isIppatsu: false,
  };
  const evaluate = (riichi: boolean): number | null => {
    try {
      const result = scoreHand({ ...winState, isRiichi: riichi,
        isIppatsu: riichi });
      return result?.valid && result.handInterpretations.length
        ? Math.max(...result.handInterpretations.map(h => h.totalWinnings))
        : null;
    } catch { return null; }
  };
  const without = evaluate(initial.isRiichi);
  // Last-moment riichi requires a previous discard with a future own draw,
  // and is not legal on the initial draw or after all own draws have passed.
  const lastDiscardWallIndex = opportunity.type === 'ron'
    ? opportunity.wallIndex - 1 : opportunity.wallIndex - 2;
  const canLateRiichi = !initial.isRiichi && discards.length > 0 &&
    lastDiscardWallIndex >= 0 && opportunity.wallIndex + (opportunity.type === 'ron' ? 1 : 0) < initial.wall.length;
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
