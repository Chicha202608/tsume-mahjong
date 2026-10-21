import { isTableMode } from '@/game/seatFlow';
import type { Tile, Wind } from '@/types';
import { isPlayerWallIndex, wallSeatAt } from '@/game/seatFlow';
import type { State } from '@/game/gameState';

/**
 * Standard-hand, seven-pairs and kokushi tenpai candidates from initial 13 tiles and future player
 * draws. This is a candidate generator, not yet a score optimizer.
 * CPU discards cannot contribute to a tenpai hand.
 */
export interface TenpaiCandidate {
  /** 34 tile-face counts; red fives are kept when materializing the line. */
  counts: number[];
  /** Zero means the 13-tile shape is already available. */
  earliestPlayerDraw: number;
  /** All tile faces (0..33) completing this exact shape. */
  waits: number[];
}

function indexOf(tile: Tile): number {
  const base = tile.suit === 'man' ? 0 : tile.suit === 'pin' ? 9 :
    tile.suit === 'sou' ? 18 : tile.suit === 'wind' ? 27 : 31;
  return base + tile.value - 1;
}

function isStandardWin(counts: number[], numFuro = 0): boolean {
  if (counts.reduce((a, b) => a + b, 0) !== 14 - 3 * numFuro) return false;
  const melds = (n: number): boolean => {
    if (!n) return counts.every(x => x === 0);
    const i = counts.findIndex(x => x > 0);
    if (i < 0) return false;
    if (counts[i] >= 3) {
      counts[i] -= 3;
      const ok = melds(n - 1);
      counts[i] += 3;
      if (ok) return true;
    }
    if (i < 27 && i % 9 <= 6 && counts[i + 1] && counts[i + 2]) {
      counts[i]--; counts[i + 1]--; counts[i + 2]--;
      const ok = melds(n - 1);
      counts[i]++; counts[i + 1]++; counts[i + 2]++;
      if (ok) return true;
    }
    return false;
  };
  for (let i = 0; i < 34; i++) {
    if (counts[i] < 2) continue;
    counts[i] -= 2;
    const ok = melds(4 - numFuro);
    counts[i] += 2;
    if (ok) return true;
  }
  return false;
}

function waitsFor(counts: number[], numFuro = 0): number[] {
  const waits: number[] = [];
  for (let i = 0; i < 34; i++) {
    if (counts[i] >= 4) continue;
    counts[i]++;
    const ok = isStandardWin(counts, numFuro);
    counts[i]--;
    if (ok) waits.push(i);
  }
  return waits;
}

export function enumerateTenpaiCandidates(state: State, options: {
  allowOpen?: boolean;
  shouldStop?: () => boolean;
  accept?: (candidate: TenpaiCandidate) => boolean;
} = {}): TenpaiCandidate[] {
  if (!options.allowOpen && state.playerFuro.some(f => f.type !== 'ankan')) return [];
  const numFuro = state.playerFuro.length;
  const fixed = [...state.playerHand, ...(state.playerDrawnTile ? [state.playerDrawnTile] : [])];
  // A wall draw is consumed by the player only when the current turn points
  // to the player; thereafter players alternate (no calls/kan).
  const draws = state.wall.filter((_, i) => isPlayerWallIndex(state, i));
  const available = Array<number>(34).fill(0);
  for (const tile of [...fixed, ...draws]) available[indexOf(tile)]++;
  const counts = Array<number>(34).fill(0);
  const found = new Map<string, TenpaiCandidate>();
  const examined = new Set<string>();
  const initialCounts = Array<number>(34).fill(0);
  for (const tile of fixed) initialCounts[indexOf(tile)]++;
  const drawFaces = draws.map(indexOf);

  // Build complete melds and partial melds directly, never choose arbitrary
  // 13-subsets of the entire tile pool.
  const emit = (knownWaits?: number[]) => {
    if (options.shouldStop?.()) return;
    const key = counts.join(',');
    const existing = found.get(key);
    if (existing && knownWaits) {
      // A shape can be both standard and seven-pairs tenpai. Keep every wait
      // on the same target, including standard waits relevant to furiten.
      existing.waits = [...new Set([...existing.waits, ...knownWaits])].sort((a, b) => a - b);
      return;
    }
    if (!knownWaits && examined.has(key)) return;
    examined.add(key);
    // For every required face, use initially held copies first, then find the
    // earliest own draw covering the shortfall. This is an optimistic lower
    // bound on when the shape can be reached, not a claim of legal replay.
    const used = initialCounts;
    let earliest = 0;
    const gathered = [...used];
    const meets = () => counts.every((n, i) => gathered[i] >= n);
    if (!meets()) {
      for (let d = 0; d < draws.length; d++) {
        gathered[drawFaces[d]]++;
        if (meets()) { earliest = d + 1; break; }
      }
    }
    if (!meets()) return;
    const waits = (knownWaits ?? waitsFor(counts, numFuro)).filter(i =>
      !(state.mode === 'three' && i >= 1 && i <= 7) &&
      counts[i] + state.playerFuro.flatMap(f => f.tiles).filter(t => indexOf(t) === i).length < 4);
    if (!waits.length) return;
    const candidate = { counts: [...counts], earliestPlayerDraw: earliest, waits };
    if (!options.accept || options.accept(candidate)) found.set(key, candidate);
  };
  const select = (tiles: number[], next: () => void) => {
    if (options.shouldStop?.()) return;
    const needed = new Map<number, number>();
    for (const i of tiles) needed.set(i, (needed.get(i) ?? 0) + 1);
    if ([...needed].some(([i, n]) => counts[i] + n > available[i])) return;
    tiles.forEach(i => counts[i]++);
    next();
    tiles.forEach(i => counts[i]--);
  };
  const melds: number[][] = [];
  for (let i = 0; i < 34; i++) {
    if (available[i] >= 3) melds.push([i, i, i]);
    if (i < 27 && i % 9 <= 6 && available[i] && available[i+1] && available[i+2])
      melds.push([i, i+1, i+2]);
  }
  const buildMelds = (n: number, start: number, next: () => void): void => {
    if (options.shouldStop?.()) return;
    if (!n) { next(); return; }
    for (let m = start; m < melds.length && !options.shouldStop?.(); m++) {
      select(melds[m], () => buildMelds(n-1, m, next));
    }
  };
  // Four melds + singleton (tanki).
  buildMelds(4 - numFuro, 0, () => {
    for (let i = 0; i < 34; i++) select([i], () => emit());
  });
  // Three melds + pair + taatsu (including shanpon).
  if (numFuro < 4) buildMelds(3 - numFuro, 0, () => {
    for (let head = 0; head < 34; head++) select([head, head], () => {
      for (let i = 0; i < 34; i++) {
        select([i,i], () => emit());
        if (i < 27) for (const delta of [1,2]) {
          const j = i + delta;
          if (j < 27 && Math.floor(j / 9) === Math.floor(i / 9))
            select([i,j], () => emit());
        }
      }
    });
  });
  // Seven pairs: choose six DISTINCT pair faces and one different singleton.
  // Four identical tiles are never treated as two pairs. Enumerating this
  // structure directly avoids arbitrary 13-subsets of the available pool.
  const pairFaces = available.flatMap((n, i) => n >= 2 ? [i] : []);
  const buildPairs = (remaining: number, start: number): void => {
    if (options.shouldStop?.()) return;
    if (remaining === 0) {
      for (let i = 0; i < 34; i++) {
        if (available[i] === 0 || counts[i] !== 0) continue;
        select([i], () => emit([i]));
      }
      return;
    }
    for (let p = start; p <= pairFaces.length - remaining; p++) {
      const i = pairFaces[p];
      select([i, i], () => buildPairs(remaining - 1, p + 1));
    }
  };
  if (!numFuro) buildPairs(6, 0);
  // Kokushi: thirteen distinct terminals/honors, or twelve distinct faces
  // with a pair and one missing face. Only own draws may supply target tiles.
  const orphans = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  if (!numFuro) select(orphans, () => emit(orphans));
  if (!numFuro) for (const missing of orphans) {
    for (const pair of orphans) {
      if (pair === missing) continue;
      select([...orphans.filter(i => i !== missing), pair], () => emit([missing]));
    }
  }
  return [...found.values()].sort((a,b) =>
    a.earliestPlayerDraw - b.earliestPlayerDraw ||
    a.counts.join(',').localeCompare(b.counts.join(',')));
}

/** A chronological win opportunity for an already enumerated tenpai shape. */
export interface CandidateWinOpportunity {
  sourceWind?: Wind;
  candidate: TenpaiCandidate;
  type: 'tsumo' | 'ron';
  /** Index of the winning tile in the remaining wall. */
  wallIndex: number;
  /** Tile face of the winning tile (0..33). */
  winningFace: number;
}

/**
 * Match a candidate against concrete future winning tiles. A tsumo requires
 * the 13-tile target to be obtainable BEFORE that player draw. A ron requires
 * it before the CPU discard. The result is a necessary condition, not yet a
 * replay/legal-furiten/riichi or score verdict.
 */
export function findCandidateWinOpportunities(
  state: State,
  candidates: TenpaiCandidate[],
  shouldStop?: () => boolean,
): CandidateWinOpportunity[] {
  if (state.playerFuro.length || !['playerDraw', 'cpuTurn'].includes(state.phase)) return [];
  const held = Array<number>(34).fill(0);
  for (const tile of state.playerHand) held[indexOf(tile)]++;
  const opportunities: CandidateWinOpportunity[] = [];
  for (let wallIndex = 0; wallIndex < state.wall.length; wallIndex++) {
    if (shouldStop?.()) break;
    const ownDraw = isPlayerWallIndex(state, wallIndex);
    // At this point, held contains the starting hand and all PRECEDING
    // own draws, not the current winning tile.
    const winFace = indexOf(state.wall[wallIndex]);
    for (const candidate of candidates) {
      if (shouldStop?.()) break;
      if (!candidate.waits.includes(winFace)) continue;
      if (!candidate.counts.every((n, i) => held[i] >= n)) continue;
      opportunities.push({
        candidate, type: ownDraw ? 'tsumo' : 'ron', wallIndex,
        winningFace: winFace,
        ...(isTableMode(state) && !ownDraw ? { sourceWind: wallSeatAt(state, wallIndex) } : {}),
      });
    }
    if (ownDraw) held[winFace]++;
  }
  return opportunities;
}
