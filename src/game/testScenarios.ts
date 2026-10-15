import { createDeck, shuffle, sortHand } from '@/gameLogic';
import { makeInitialStateBase, type State } from '@/game/gameState';
import type { Tile, Furo } from '@/types';

/** Deterministic UI test: riichi, three 1m in hand, fourth 1m next draw.
 * The original 5p tanki wait survives the concealed kan.
 */
export function makeRiichiAnkanTestState(): State {
  const deck = createDeck();
  const take = (suit: Tile['suit'], value: number): Tile => {
    const index = deck.findIndex(tile => tile.suit === suit && tile.value === value);
    if (index < 0) throw new Error(`Missing test tile: ${suit} ${value}`);
    return deck.splice(index, 1)[0];
  };
  const hand = sortHand([
    take('man', 1), take('man', 1), take('man', 1),
    take('pin', 2), take('pin', 3), take('pin', 4),
    take('sou', 3), take('sou', 4), take('sou', 5),
    take('sou', 6), take('sou', 7), take('sou', 8),
    take('pin', 5),
  ]);
  const nextDraw = take('man', 1);
  const cpuHand = sortHand(deck.splice(0, 13));
  const wanpai = deck.splice(0, 14);
  const wall = [nextDraw, ...deck.slice(0, 25)];

  return {
    ...makeInitialStateBase(hand, cpuHand, wall, wanpai),
    isRiichi: true,
    isIppatsu: false,
    turnCount: 5,
    roundWind: 'east',
    playerWind: 'south',
  };
}


/**
 * Deterministic, non-furiten open ittsu ron:
 * called 123m; concealed 456m 789m 23p 55s; CPU next discards 4p.
 * The test starts immediately before CPU's discard for a visible ron button.
 */
export function makeOpenIttsuRonTestState(): State {
  const deck = createDeck();
  const take = (suit: Tile['suit'], value: number): Tile => {
    const index = deck.findIndex(tile => tile.suit === suit && tile.value === value && !tile.isRed);
    if (index < 0) throw new Error(`Missing test tile: ${suit} ${value}`);
    return deck.splice(index, 1)[0];
  };
  const run123 = [take('man', 1), take('man', 2), take('man', 3)];
  const hand = sortHand([
    take('man', 4), take('man', 5), take('man', 6),
    take('man', 7), take('man', 8), take('man', 9),
    take('pin', 2), take('pin', 3),
    take('sou', 5), take('sou', 5),
  ]);
  const winningTile = take('pin', 4);
  const cpuHand = sortHand(deck.splice(0, 13));
  const wanpai = deck.splice(0, 14);
  const wall = [winningTile, ...deck.splice(0, 25)];
  return {
    ...makeInitialStateBase(hand, cpuHand, wall, wanpai),
    playerFuro: [{ type: 'chii', tiles: run123, calledTile: run123[2] }],
    phase: 'cpuTurn',
    turnCount: 5,
    roundWind: 'east',
    playerWind: 'south',
    playerDiscards: [],
    isRiichi: false,
  };
}

/** The same open ittsu tenpai, with 4p as the player's next self-draw. */
export function makeOpenIttsuTsumoTestState(): State {
  const state = makeOpenIttsuRonTestState();
  return { ...state, phase: 'playerDraw' };
}

/** A bounded 36-tile live wall for the kan preparation buttons. */
export function makeKanTestState(mode: 'ankan' | 'kakan' | 'daiminkan'): State {
  const deck = shuffle(createDeck());

  const suits = ['man', 'pin', 'sou', 'wind', 'dragon'] as const;
  const suit = suits[Math.floor(Math.random() * suits.length)];
  const maxVal = suit === 'wind' ? 4 : suit === 'dragon' ? 3 : 9;
  const value = Math.floor(Math.random() * maxVal) + 1;

  const tileATiles = deck.filter(t => t.suit === suit && t.value === value);
  const remaining = deck.filter(t => !(t.suit === suit && t.value === value));

  const baseHand = remaining.slice(0, 10);
  const cpuHand = sortHand(remaining.slice(10, 23));
  const wanpai = remaining.slice(23, 37);
  const wallTiles = remaining.slice(37, 37 + 35);

  let newState: State;

  if (mode === 'ankan') {
    const hand = sortHand([...baseHand, ...tileATiles.slice(0, 3)]);
    const wall = [tileATiles[3], ...wallTiles];
    newState = {
      ...makeInitialStateBase(hand, cpuHand, wall, wanpai),
    };
  } else if (mode === 'kakan') {
    const pungFuro: Furo = {
      tiles: tileATiles.slice(0, 3),
      type: 'pung',
      calledTile: tileATiles[0],
    };
    const hand = sortHand(baseHand);
    const wall = [tileATiles[3], ...wallTiles];
    newState = {
      ...makeInitialStateBase(hand, cpuHand, wall, wanpai),
      playerFuro: [pungFuro],
    };
  } else {
    const hand = sortHand([...baseHand, ...tileATiles.slice(0, 3)]);
    const wall = [wallTiles[0], tileATiles[3], ...wallTiles.slice(1)];
    newState = {
      ...makeInitialStateBase(hand, cpuHand, wall, wanpai),
    };
  }

  return newState;
}
