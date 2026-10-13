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
