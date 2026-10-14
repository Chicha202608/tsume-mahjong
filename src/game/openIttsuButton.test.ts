import { describe, expect, it } from 'vitest';
import { makeOpenIttsuRonTestState, makeOpenIttsuTsumoTestState } from '@/game/testScenarios';
import { applyCpuTurn, applyCallRon, applyPlayerDraw, applyDeclareTsumo } from '@/game/transitions';
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

  it('offers tsumo after drawing 4p and scores open ittsu', () => {
    const initial = makeOpenIttsuTsumoTestState();
    expect(initial.phase).toBe('playerDraw');
    const drawn = applyPlayerDraw(initial);
    expect(drawn?.playerDrawnTile).toMatchObject({ suit: 'pin', value: 4 });
    expect(drawn?.tsumoAvailable).toBe(true);
    if (!drawn) throw new Error('Expected draw state');
    const won = applyDeclareTsumo(drawn);
    expect(won?.phase).toBe('win');
    if (!won) throw new Error('Tsumo action unavailable');
    const score = scoreHand(won);
    expect(score?.valid, JSON.stringify(score?.errors)).toBe(true);
    expect(score?.handInterpretations.length).toBeGreaterThan(0);
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
