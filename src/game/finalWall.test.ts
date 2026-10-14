import { describe, expect, it } from 'vitest';
import { makeInitialStateBase } from '@/game/gameState';
import { applyPlayerDiscard, applyCpuTurn, applyPlayerDraw } from '@/game/transitions';
import { buildHandInput } from '@/game/scoreAdapter';
import type { Tile } from '@/types';

const tile = (id: string, value = 1): Tile => ({ id, suit: 'man', value });
describe('last live wall tile and last-tile yaku', () => {
  it('player-first: eighteenth discard still gives CPU its final draw and discard', () => {
    const current = makeInitialStateBase([], [], [tile('final')], [], 'east', 'south');
    const afterDiscard = applyPlayerDiscard({ ...current, phase: 'playerDiscard', playerDrawnTile: tile('held'), turnCount: 17 });
    expect(afterDiscard?.phase).toBe('cpuTurn');
    expect(afterDiscard?.turnCount).toBe(18);
    const afterCpu = applyCpuTurn(afterDiscard!);
    expect(afterCpu?.cpuDiscards.map(t => t.id)).toEqual(['final']);
    expect(afterCpu?.phase).toBe('exhausted');
  });
  it('CPU-first: final own draw is the last tile', () => {
    const current = makeInitialStateBase([], [], [tile('last')], [], 'south', 'east');
    const drawn = applyPlayerDraw({ ...current, phase: 'playerDraw', turnCount: 17 });
    expect(drawn?.wall).toEqual([]);
    expect(drawn?.phase).toBe('playerDiscard');
    expect(drawn?.playerDrawnTile?.id).toBe('last');
  });
  it('sets last-tile gameState flags for tsumo and ron independently', () => {
    const initial = makeInitialStateBase([], [], [], [], 'east', 'south');
    const base = { ...initial, phase: 'win' as const, winTile: tile('win') };
    const haitei = buildHandInput({ ...base, winType: 'tsumo', playerDrawnTile: base.winTile });
    const houtei = buildHandInput({ ...base, winType: 'ron' });
    expect(haitei?.gameState.isHaitei).toBe(true);
    expect(haitei?.gameState.isHoutei).toBe(false);
    expect(houtei?.gameState.isHoutei).toBe(true);
    expect(houtei?.gameState.isHaitei).toBe(false);
  });
  it('does not assign last-tile flags while live tiles remain', () => {
    const initial = makeInitialStateBase([], [], [tile('future')], [], 'east', 'south');
    const state = { ...initial, phase: 'win' as const, winTile: tile('win'), winType: 'ron' as const };
    expect(buildHandInput(state)?.gameState.isHoutei).toBe(false);
  });
});
