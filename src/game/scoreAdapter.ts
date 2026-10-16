import { Tile, Furo, Wind } from '@/types';
import { State } from '@/game/gameState';
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

  const cpuDir = state.mode === 'four' ? toDirection(state.winFromWind ?? state.lastDiscardWind ?? state.cpuWind) : cpuDirection(state.playerWind);
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
    isHaitei: state.winType === 'tsumo' && !state.drawnFromRinshan && state.wall.length === 0 && state.fullWall.length === (state.mode === 'four' ? 70 : 36),
    isHoutei: state.winType === 'ron' && state.wall.length === 0 && state.fullWall.length === (state.mode === 'four' ? 70 : 36),
  });

  return {
    closedTiles,
    openMelds,
    winningTile,
    gameState,
  };
}

// ── Score calculation wrapper ──

export function scoreHand(state: State): HandAnalysis | null {
  const input = buildHandInput(state);
  if (!input) return null;
  return calculate(input);
}

// ── Yaku check for ron eligibility ──

export function canRonWithYaku(state: State, discardTile: Tile): boolean {
  const winState: State = {
    ...state,
    phase: 'win' as const,
    winType: 'ron' as const,
    winTile: discardTile,
    playerDrawnTile: null,
    lastCpuDiscard: discardTile,
    ...(state.mode === 'four' ? { winFromWind: state.nextSeat } : {}),
    // This helper runs before applyCpuTurn consumes the CPU's wall tile.
    wall: state.wall.slice(1),
  };
  try {
    const result = scoreHand(winState);
    return !!result && result.valid && result.handInterpretations.length > 0;
  } catch {
    return false;
  }
}

// ── Yaku check for tsumo eligibility ──

export function canTsumoWithYaku(state: State, drawTile: Tile): boolean {
  const winState: State = {
    ...state,
    phase: 'win' as const,
    winType: 'tsumo' as const,
    winTile: drawTile,
    playerDrawnTile: drawTile,
    // This helper runs before applyPlayerDraw consumes the winning tile.
    wall: state.drawnFromRinshan ? state.wall : state.wall.slice(1),
  };
  try {
    const result = scoreHand(winState);
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
