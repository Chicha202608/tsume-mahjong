import { describe, expect, it } from 'vitest';
import { makeOpenIttsuRonTestState } from '@/game/testScenarios';
import { applyCpuTurn, applyCallRon } from '@/game/transitions';
import { getWaits, isFuriten } from '@/gameLogic';
import { scoreHand } from '@/game/scoreAdapter';

describe('one-click open ittsu ron scenario', () => {
  it('has a non-furiten open one-suit straight ready for the CPU discard', () => {
    const state = makeOpenIttsuRonTestState();
    expect(state.playerFuro).toHaveLength(1);
    expect(state.playerFuro[0].type).toBe('chii');
    expect(state.phase).toBe('cpuTurn');
    expect(state.wall[0]).toMatchObject({ suit: 'pin', value: 4 });
    expect(isFuriten(getWaits(state.playerHand, state.playerFuro), state.playerDiscards)).toBe(false);
  });

  it('displays ron after CPU discard and scores the winning action', () => {
    const state = makeOpenIttsuRonTestState();
    const afterCpu = applyCpuTurn(state);
    expect(afterCpu?.phase).toBe('naki');
    expect(afterCpu?.ronAvailable).toBe(true);
    if (!afterCpu) throw new Error('CPU did not discard');
    const won = applyCallRon(afterCpu);
    expect(won?.phase).toBe('win');
    if (!won) throw new Error('Ron action was refused');
    const score = scoreHand(won);
    expect(score?.valid, JSON.stringify(score?.errors)).toBe(true);
    expect(score?.handInterpretations.length).toBeGreaterThan(0);
  });
});
