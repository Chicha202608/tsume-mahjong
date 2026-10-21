import type { Tile } from '@/types';
import type { State } from '@/game/gameState';
import type { TenpaiCandidate } from '@/game/tenpaiCandidates';
import { analyzeSearchHand, type SearchContext } from '@/game/searchContext';

const face = (t: Tile) => (t.suit === 'man' ? 0 : t.suit === 'pin' ? 9 : t.suit === 'sou' ? 18 : t.suit === 'wind' ? 27 : 31) + t.value - 1;

/** Score a target with optimistic bonuses before paying for chronological replay.
 * All planned north/kan bonuses, closed riichi + ippatsu and one additional
 * last-tile/rinshan han are allowed even when their timing is impossible.
 * The larger four-player ron multiplier also bounds three-player tsumo loss. */
export function threePlayerScoreUpperBound(state: State, target: TenpaiCandidate, pool: Tile[], winningPool: Tile[], context?: SearchContext): number {
  const material = [...pool].sort((a, b) => Number(!!b.isRed) - Number(!!a.isRed));
  const used = new Set(state.playerFuro.flatMap(f => f.tiles).map(t => t.id));
  const closed = state.playerFuro.every(f => f.type === 'ankan');
  let upper = 0;
  for (const wait of target.waits) {
    const examined = new Set<string>();
    for (const winTile of winningPool.filter(t => face(t) === wait && !used.has(t.id))) {
      // Reserve the winning physical copy first. Otherwise a red winning five
      // could be consumed by target materialization and wrongly appear unavailable.
      const needed = [...target.counts];
      const hand: Tile[] = [];
      for (const tile of material) {
        if (tile.id !== winTile.id && needed[face(tile)] > 0) { hand.push(tile); needed[face(tile)]--; }
      }
      if (needed.some(n => n > 0)) continue;
      const signature = `${!!winTile.isRed}:${hand.filter(t => t.isRed).map(face).join(',')}`;
      if (examined.has(signature)) continue;
      examined.add(signature);
      for (const winType of ['ron', 'tsumo'] as const) {
        let result: ReturnType<typeof analyzeSearchHand>;
        try { result = analyzeSearchHand({ ...state, phase: 'win', winType, winTile, playerHand: hand,
          playerDrawnTile: null, wall: [], isRiichi: closed, isIppatsu: closed,
          winFromWind: state.playerWind === 'east' ? 'south' : 'east',
          drawnFromNuki: false, drawnFromRinshan: false }, context); } catch { return Infinity; }
        // A synthetic invalid hand is not evidence that the real route is impossible.
        if (!result?.valid) return Infinity;
        for (const interpretation of result.handInterpretations) {
          const han = interpretation.han + 1;
          const bp = interpretation.limit ? interpretation.basicPoints : han >= 13 ? 8000 : han >= 11 ? 6000
            : han >= 8 ? 4000 : han >= 6 ? 3000 : Math.min(2000, interpretation.fu * 2 ** (han + 2));
          upper = Math.max(upper, Math.ceil(bp * (state.playerWind === 'east' ? 6 : 4) / 100) * 100);
        }
      }
    }
  }
  return upper;
}
