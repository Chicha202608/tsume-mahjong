import type { State } from '@/game/gameState';

/** Conservative payout ceiling for the current scorer's single-yakuman defaults.
 * Include every remaining wall tile (even opponents' draws) and every rinshan
 * tile. Ignoring timing and meld compatibility can only overestimate the score.
 * Kokushi and chuuren cannot stack with the structural yakuman below; counted
 * yakuman is also a single limit. Event yakuman are not enabled by scoreAdapter.
 */
export function searchScoreCeiling(state: State): number {
  const counts = Array<number>(34).fill(0);
  const material = [...state.playerHand, ...(state.playerDrawnTile ? [state.playerDrawnTile] : []),
    ...state.playerFuro.flatMap(f => f.tiles), ...state.wall, ...state.wanpai.slice(0, 4),
    ...(state.lastCpuDiscard ? [state.lastCpuDiscard] : []), ...(state.winTile ? [state.winTile] : [])];
  for (const t of material) {
    const base = t.suit === 'man' ? 0 : t.suit === 'pin' ? 9 : t.suit === 'sou' ? 18 : t.suit === 'wind' ? 27 : 31;
    counts[base + t.value - 1]++;
  }
  const supply = (faces: number[]) => faces.reduce((n, f) => n + Math.min(4, counts[f]), 0);
  let limits = 0;
  // Four concealed triplets, four kans, big three dragons, and either wind yakuman.
  if (counts.filter(n => n >= 3).length >= 4) limits++;
  if (counts.filter(n => n >= 4).length >= 4) limits++;
  if ([31, 32, 33].every(f => counts[f] >= 3)) limits++;
  if ([27, 28, 29, 30].every(f => counts[f] >= 2) &&
      [27, 28, 29, 30].filter(f => counts[f] >= 3).length >= 3) limits++;
  if (supply([27, 28, 29, 30, 31, 32, 33]) >= 14) limits++;
  if (supply([0, 8, 9, 17, 18, 26]) >= 14) limits++;
  if (supply([19, 20, 21, 23, 25, 32]) >= 14) limits++;
  return Math.max(1, limits) * 8000 * (state.playerWind === 'east' ? 6 : 4);
}
