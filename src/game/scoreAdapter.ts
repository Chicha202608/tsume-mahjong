import { isTableMode } from '@/game/seatFlow';
import { Tile, Furo, Wind } from '@/types';
import { State } from '@/game/gameState';
import { nextDoraTile, sameTile } from '@/gameLogic';
import {
  calculate,
  createGameState,
  createMeld,
  KAMICHA,
  type HandInput,
  type MahjongTile,
  type Meld,
  type Direction,
  type WinningTile,
  type HandAnalysis,
  type HandInterpretation,
} from 'riichi-score';

// ── Tile → MahjongTile string conversion ──

export function toMahjongTile(tile: Tile): MahjongTile {
  if (tile.suit === 'man' || tile.suit === 'pin' || tile.suit === 'sou') {
    const suitChar = tile.suit === 'man' ? 'm' : tile.suit === 'pin' ? 'p' : 's';
    const rank = tile.isRed ? 0 : tile.value;
    return `${rank}${suitChar}` as MahjongTile;
  }
  // Honors: wind 1-4 → 1z-4z, dragon 1-3 → 5z-7z
  const honorRank = tile.suit === 'wind' ? tile.value : tile.value + 4;
  return `${honorRank}z` as MahjongTile;
}

/**
 * Dora indicators show a tile's rank, not its aka-dora identity.
 * A red five used as an indicator must therefore be passed as an ordinary five
 * (e.g. 5m), so the next dora is 6m rather than interpreting 0m as a tile rank.
 */
function toDoraIndicatorTile(tile: Tile): MahjongTile {
  if (tile.isRed && (tile.suit === 'man' || tile.suit === 'pin' || tile.suit === 'sou')) {
    const suitChar = tile.suit === 'man' ? 'm' : tile.suit === 'pin' ? 'p' : 's';
    return `${tile.value}${suitChar}` as MahjongTile;
  }
  return toMahjongTile(tile);
}

// ── Furo → Meld conversion ──

const FURO_TYPE_MAP: Record<Furo['type'], 'run' | 'triplet' | 'daiminkan' | 'shouminkan' | 'ankan'> = {
  chii: 'run',
  pung: 'triplet',
  daiminkan: 'daiminkan',
  kakan: 'shouminkan',
  ankan: 'ankan',
  kan: 'daiminkan',
};

function toMeld(furo: Furo, cpuDir: Direction, kamichaDir: Direction): Meld {
  const groupType = FURO_TYPE_MAP[furo.type];
  const tiles = furo.tiles.map(toMahjongTile);

  if (groupType === 'ankan') {
    return createMeld({ type: 'ankan', tiles });
  }

  const calledIndex = furo.tiles.findIndex(t => t.id === furo.calledTile.id);
  // Chi must come from kamicha; other called melds come from the CPU seat.
  const from = furo.fromWind ? toDirection(furo.fromWind) : groupType === 'run' ? kamichaDir : cpuDir;
  return createMeld({
    type: groupType,
    tiles,
    from,
    calledIndex: calledIndex === -1 ? 0 : calledIndex,
  });
}

// ── Wind → Direction ──

function toDirection(wind: Wind): Direction {
  return wind as Direction;
}

// CPU direction: next wind clockwise from playerWind.
// Used as `from` for ron and non-chii melds.
function cpuDirection(playerWind: Wind): Direction {
  const order: Wind[] = ['east', 'south', 'west', 'north'];
  const idx = order.indexOf(playerWind);
  return order[(idx + 1) % 4] as Direction;
}

// Chi may only be called from kamicha (the seat to the player's left).
// riichi-score validates this against KAMICHA[seatWind].
function kamichaDirection(playerWind: Wind): Direction {
  return KAMICHA[playerWind as Direction];
}

// ── Build HandInput from State ──

export function buildHandInput(state: State): HandInput | null {
  if (state.phase !== 'win' || !state.winTile || !state.winType) return null;

  const cpuDir = isTableMode(state) ? toDirection(state.winFromWind ?? state.lastDiscardWind ?? state.cpuWind) : cpuDirection(state.playerWind);
  const kamichaDir = kamichaDirection(state.playerWind);
  const closedTiles = state.playerHand.map(toMahjongTile);
  const openMelds = state.playerFuro.map(f => toMeld(f, cpuDir, kamichaDir));

  let winningTile: WinningTile;
  if (state.winType === 'tsumo') {
    winningTile = { tile: toMahjongTile(state.winTile), isTsumo: true };
  } else {
    winningTile = { tile: toMahjongTile(state.winTile), from: cpuDir };
  }

  const doraIndicators = state.wanpai
    .slice(4, 4 + state.doraCount)
    .map(toDoraIndicatorTile);

  const uradoraIndicators = state.isRiichi
    ? state.wanpai.slice(9, 9 + state.doraCount).map(toDoraIndicatorTile)
    : [];

  const gameState = createGameState({
    roundWind: toDirection(state.roundWind),
    seatWind: toDirection(state.playerWind),
    doraIndicators,
    uradoraIndicators,
    isRiichi: state.isRiichi,
    isIppatsu: state.isIppatsu,
    isRinshan: state.winType === 'tsumo' && !!state.drawnFromRinshan,
    isHaitei: state.winType === 'tsumo' && !state.drawnFromRinshan && !state.drawnFromNuki && state.wall.length === 0 && state.fullWall.length === (state.mode === 'three' ? 55 : isTableMode(state) ? 70 : 36),
    isHoutei: state.winType === 'ron' && state.wall.length === 0 && state.fullWall.length === (state.mode === 'three' ? 55 : isTableMode(state) ? 70 : 36),
  });

  return {
    closedTiles,
    openMelds,
    winningTile,
    gameState,
  };
}

// ── Score calculation wrapper ──

export type ScoredHandAnalysis = Omit<HandAnalysis, 'handInterpretations'> & {
  handInterpretations: (HandInterpretation & { nukiDora?: number })[];
};

export interface BaseScoreCache extends Map<string, HandAnalysis> {
  cacheHits?: number;
  computations?: number;
}

/** Concealed tile order and physical IDs do not change a hand's score. */
export function handInputCacheKey(input: HandInput): string {
  return JSON.stringify({ ...input, closedTiles: [...input.closedTiles].sort() });
}

export function scoreHand(state: State, baseCache?: BaseScoreCache): ScoredHandAnalysis | null {
  const input = buildHandInput(state);
  if (!input) return null;
  const key = baseCache ? handInputCacheKey(input) : '';
  let base = baseCache?.get(key);
  if (base && baseCache?.cacheHits !== undefined) baseCache.cacheHits++;
  if (!base) {
    if (baseCache?.computations !== undefined) baseCache.computations++;
    base = calculate(input);
    if (baseCache) {
      if (baseCache.size >= 4096) {
        const oldest = baseCache.keys().next().value;
        if (oldest !== undefined) baseCache.delete(oldest);
      }
      baseCache.set(key, base);
    }
  }
  // North bonuses and three-player payments only alter these interpretation
  // fields. Keep the expensive grouping/yaku analysis immutable in the cache.
  const result: ScoredHandAnalysis = baseCache && state.mode === 'three'
    ? { ...base, handInterpretations: base.handInterpretations.map(hand => ({ ...hand })) } : base;
  if (state.mode !== 'three' || !result.valid) return result;
  const tiles = [...state.playerHand, ...state.playerFuro.flatMap(f => f.tiles), state.winTile!];
  const indicators = state.wanpai.slice(4, 4 + state.doraCount);
  const ura = state.isRiichi ? state.wanpai.slice(9, 9 + state.doraCount) : [];
  const countDora = (list: Tile[], material: Tile[]) => list.reduce((n, indicator) =>
    n + material.filter(t => sameTile(t, nextDoraTile(indicator, 'three'))).length, 0);
  for (const hand of result.handInterpretations) {
    // Keep yakuman payouts from the library, including stacked yakuman.
    if (!hand.limit) {
      const dora = countDora(indicators, tiles);
      const uradora = countDora(ura, tiles);
      hand.nukiDora = (state.playerNuki?.length ?? 0) + countDora([...indicators, ...ura], state.playerNuki ?? []);
      hand.han += dora - hand.dora + uradora - hand.uradora + hand.nukiDora;
      hand.dora = dora;
      hand.uradora = uradora;
      hand.basicPoints = hand.han >= 13 ? 8000 : hand.han >= 11 ? 6000 : hand.han >= 8 ? 4000
        : hand.han >= 6 ? 3000 : Math.min(2000, hand.fu * 2 ** (hand.han + 2));
    }
    const bp = hand.basicPoints;
    const round = (n: number) => Math.ceil(n / 100) * 100;
    hand.seatPayments = state.winType === 'ron'
      ? [{ seat: state.winFromWind ?? state.lastDiscardWind ?? state.cpuWind, value: round(bp * (state.playerWind === 'east' ? 6 : 4)) }]
      : (['east', 'south', 'west'] as const).filter(w => w !== state.playerWind)
        .map(seat => ({ seat, value: round(bp * (state.playerWind === 'east' || seat === 'east' ? 2 : 1)) }));
    hand.totalWinnings = hand.seatPayments.reduce((n, payment) => n + payment.value, 0);
  }
  result.handInterpretations.sort((a, b) => b.totalWinnings - a.totalWinnings);
  return result;
}

// ── Yaku check for ron eligibility ──

export function canRonWithYaku(state: State, discardTile: Tile, baseCache?: BaseScoreCache): boolean {
  const winState: State = {
    ...state,
    phase: 'win' as const,
    winType: 'ron' as const,
    winTile: discardTile,
    playerDrawnTile: null,
    lastCpuDiscard: discardTile,
    ...(isTableMode(state) ? { winFromWind: state.nextSeat } : {}),
    // This helper runs before applyCpuTurn consumes the CPU's wall tile.
    wall: state.wall.slice(1),
  };
  try {
    const result = scoreHand(winState, baseCache);
    return !!result && result.valid && result.handInterpretations.length > 0;
  } catch {
    return false;
  }
}

// ── Yaku check for tsumo eligibility ──

export function canTsumoWithYaku(state: State, drawTile: Tile, baseCache?: BaseScoreCache): boolean {
  const winState: State = {
    ...state,
    phase: 'win' as const,
    winType: 'tsumo' as const,
    winTile: drawTile,
    playerDrawnTile: drawTile,
    // This helper runs before applyPlayerDraw consumes the winning tile.
    wall: state.drawnFromRinshan || state.drawnFromNuki ? state.wall : state.wall.slice(1),
  };
  try {
    const result = scoreHand(winState, baseCache);
    return !!result && result.valid && result.handInterpretations.length > 0;
  } catch {
    return false;
  }
}

// ── Debug: log scoring result to console ──

export function debugScore(state: State): void {
  const result = scoreHand(state);
  if (!result) {
    console.log('[scoreAdapter] Not a win state — no scoring performed.');
    return;
  }
  console.log('[scoreAdapter] valid:', result.valid);
  console.log('[scoreAdapter] errors:', result.errors);
  console.log('[scoreAdapter] interpretation count:', result.handInterpretations.length);
  for (const hi of result.handInterpretations) {
    console.log('[scoreAdapter] ── interpretation ──');
    console.log('  yaku:', hi.yaku.map(y => `${y.name}(${y.han}han${y.limit ? ' ' + y.limit : ''})`));
    console.log('  han:', hi.han);
    console.log('  fu:', hi.fu);
    console.log('  basicPoints:', hi.basicPoints);
    console.log('  totalWinnings:', hi.totalWinnings);
    console.log('  dora:', hi.dora, 'uradora:', hi.uradora, 'akadora:', hi.akadora);
    console.log('  seatPayments:', hi.seatPayments);
  }
}
