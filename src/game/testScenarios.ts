import { createDeck, shuffle, sortHand } from '@/gameLogic';
import { makeInitialStateBase, type State } from '@/game/gameState';
import type { Tile, Furo } from '@/types';
import { SEATS, seatAfter } from '@/game/seatFlow';

/** Keep debug scenarios usable in either mode without duplicating tiles. */
export function asFourPlayerTestState(state: State): State {
  const used = new Set([...state.playerHand, ...state.cpuHand, ...state.wall, ...state.wanpai,
    ...state.playerFuro.flatMap(f => f.tiles)].map(t => t.id));
  const deck = createDeck().filter(t => !used.has(t.id));
  const cpuWind = state.cpuWind === state.playerWind ? seatAfter(state.playerWind, 3) : state.cpuWind;
  const opponents = SEATS.filter(w => w !== state.playerWind).map(wind => ({ wind,
    hand: wind === cpuWind ? state.cpuHand : sortHand(deck.splice(0, 13)), discards: [] as Tile[] }));
  const cpuFirst = state.phase === 'cpuTurn';
  // Preserve the fixture's own draws while inserting the two extra CPU turns.
  const wall: Tile[] = [];
  state.wall.forEach((tile, i) => {
    wall.push(tile);
    if (i % 2 === 1) wall.push(...deck.splice(0, 2));
  });
  wall.splice(70);
  return { ...state, mode: 'four', cpuWind, opponents, wall, fullWall: [...wall],
    nextSeat: cpuFirst ? seatAfter(state.playerWind, 3) : state.playerWind };
}

export type TestMode = 'ankan' | 'kakan' | 'daiminkan' | 'riichi-ankan' |
  'open-ittsu-ron' | 'open-ittsu-tsumo' | 'two-ankan' | 'chained-ankan';

/** Short endgame with two guaranteed kans and a second-rinshan win. */
export function makeTwoAnkanTestState(chained = false): State {
  const deck = createDeck();
  const take = (suit: Tile['suit'], value: number): Tile => {
    const index = deck.findIndex(t => t.suit === suit && t.value === value && !t.isRed);
    if (index < 0) throw new Error(`Missing two-kan test tile: ${suit} ${value}`);
    return deck.splice(index, 1)[0];
  };
  const hand = sortHand([
    ...[1, 1, 1, 9, 9, 9].map(v => take('man', v)),
    ...[2, 3, 4, 5, 5].map(v => take('pin', v)), take('sou', 7), take('sou', 8),
  ]);
  const fourth1m = take('man', 1);
  const fourth9m = take('man', 9);
  const winningTile = take('sou', 9);
  const firstRinshan = chained ? fourth9m : take('dragon', 1);
  const wall = chained
    ? [fourth1m, take('wind', 1), take('wind', 2), take('wind', 3)]
    : [fourth1m, take('wind', 1), fourth9m, take('wind', 2), take('wind', 3), take('wind', 4)];
  const wanpai = [firstRinshan, winningTile, ...deck.splice(0, 2),
    take('dragon', 1), take('dragon', 2), take('dragon', 3), ...deck.splice(0, 2),
    take('dragon', 1), take('dragon', 2), take('dragon', 3), ...deck.splice(0, 2)];
  const cpuHand = sortHand(deck.splice(0, 13));
  return { ...makeInitialStateBase(hand, cpuHand, wall, wanpai, 'south', 'west'),
    roundWind: 'east', turnCount: chained ? 16 : 15 };
}

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
