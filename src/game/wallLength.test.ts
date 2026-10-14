import { describe, expect, it } from 'vitest';
import { initGame } from '@/gameLogic';
import { makeInitialState } from '@/game/gameState';
import { MAX_DRAWS } from '@/game/transitions';

describe('standard live wall length', () => {
  it('deals exactly 36 live-wall tiles for two players, 18 draws each', () => {
    for (let i = 0; i < 10; i++) {
      const deal = initGame();
      expect(deal.playerHand).toHaveLength(13);
      expect(deal.cpuHand).toHaveLength(13);
      expect(deal.wanpai).toHaveLength(14);
      expect(deal.wall).toHaveLength(2 * MAX_DRAWS);
    }
  });

  it('initial state uses the same bounded wall', () => {
    const initial = makeInitialState();
    expect(initial.wall).toHaveLength(36);
    expect(initial.fullWall).toHaveLength(36);
    expect(initial.wallDrawnCount).toBe(0);
  });
});
