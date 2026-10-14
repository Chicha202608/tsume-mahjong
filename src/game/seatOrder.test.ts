import { describe, expect, it } from 'vitest';
import { isPlayerUpwind, makeInitialStateBase } from '@/game/gameState';
import { applyCpuTurn } from '@/game/transitions';
import type { Tile, Wind } from '@/types';

const tile = (id: string, value: number): Tile => ({ id, suit: 'man', value });
const winds: Wind[] = ['east', 'south', 'west', 'north'];

describe('seat order and opening CPU discard', () => {
  it('gives upwind probabilities of 3/3, 2/3, 1/3, 0/3', () => {
    expect(winds.map(player =>
      winds.filter(cpu => cpu !== player && isPlayerUpwind(player, cpu)).length
    )).toEqual([3, 2, 1, 0]);
  });
  it('opens with the earlier seat for all 12 ordered distinct-seat pairs', () => {
    for (const player of winds) for (const cpu of winds) {
      if (player === cpu) continue;
      const state = makeInitialStateBase([], [], [tile('first', 1), tile('second', 2)], [], player, cpu);
      expect(state.phase).toBe(isPlayerUpwind(player, cpu) ? 'playerDraw' : 'cpuTurn');
      expect(state.playerWind).toBe(player);
      expect(state.cpuWind).toBe(cpu);
    }
  });
  it('when CPU is upwind, CPU discards the first wall tile before player draw', () => {
    const state = makeInitialStateBase([], [], [tile('first', 1), tile('second', 2)], [], 'south', 'east');
    expect(state.phase).toBe('cpuTurn');
    const after = applyCpuTurn(state);
    expect(after?.cpuDiscards.map(t => t.id)).toEqual(['first']);
    expect(after?.wall.map(t => t.id)).toEqual(['second']);
    expect(after?.phase).toBe('playerDraw');
    expect(after?.turnCount).toBe(0);
  });
  it('keeps deterministic player-first defaults for existing fixtures', () => {
    expect(makeInitialStateBase([], [], [], []).phase).toBe('playerDraw');
  });
});
