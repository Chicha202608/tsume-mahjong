import { createDeck, sortHand } from '@/gameLogic';
import { makeInitialStateBase, type State } from '@/game/gameState';
import type { Tile } from '@/types';

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
  const wall = [nextDraw, ...deck];

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
  const wall = [winningTile, ...deck.splice(0, 35)];
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
