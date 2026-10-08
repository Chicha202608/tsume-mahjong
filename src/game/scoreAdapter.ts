import { Tile, Furo, Wind } from '@/types';
import { State } from '@/game/gameState';
import {
  calculate,
  createGameState,
  createMeld,
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

// ── Furo → Meld conversion ──

const FURO_TYPE_MAP: Record<Furo['type'], 'run' | 'triplet' | 'daiminkan' | 'shouminkan' | 'ankan'> = {
  chii: 'run',
  pung: 'triplet',
  daiminkan: 'daiminkan',
  kakan: 'shouminkan',
  ankan: 'ankan',
  kan: 'daiminkan',
};

function toMeld(furo: Furo, cpuDir: Direction): Meld {
  const groupType = FURO_TYPE_MAP[furo.type];
  const tiles = furo.tiles.map(toMahjongTile);

  if (groupType === 'ankan') {
    return createMeld({ type: 'ankan', tiles });
  }

  const calledIndex = furo.tiles.findIndex(t => t.id === furo.calledTile.id);
  return createMeld({
    type: groupType,
    tiles,
    from: cpuDir,
    calledIndex: calledIndex === -1 ? 0 : calledIndex,
  });
}

// ── Wind → Direction ──

function toDirection(wind: Wind): Direction {
  return wind as Direction;
}

// CPU direction: next wind clockwise from playerWind
function cpuDirection(playerWind: Wind): Direction {
  const order: Wind[] = ['east', 'south', 'west', 'north'];
  const idx = order.indexOf(playerWind);
  return order[(idx + 1) % 4] as Direction;
}

// ── Build HandInput from State ──

export function buildHandInput(state: State): HandInput | null {
  if (state.phase !== 'win' || !state.winTile || !state.winType) return null;

  const cpuDir = cpuDirection(state.playerWind);
  const closedTiles = state.playerHand.map(toMahjongTile);
  const openMelds = state.playerFuro.map(f => toMeld(f, cpuDir));

  let winningTile: WinningTile;
  if (state.winType === 'tsumo') {
    winningTile = { tile: toMahjongTile(state.winTile), isTsumo: true };
  } else {
    winningTile = { tile: toMahjongTile(state.winTile), from: cpuDir };
  }

  const doraIndicators = state.wanpai
    .slice(4, 4 + state.doraCount)
    .map(toMahjongTile);

  const gameState = createGameState({
    roundWind: toDirection(state.roundWind),
    seatWind: toDirection(state.playerWind),
    doraIndicators,
    isRiichi: state.isRiichi,
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
