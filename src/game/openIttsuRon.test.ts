import { describe, expect, it } from 'vitest';
import { canRonConcealed } from '@/gameLogic';
import { canRonWithYaku, scoreHand } from '@/game/scoreAdapter';
import { makeInitialStateBase } from '@/game/gameState';
import { applyCpuTurn } from '@/game/transitions';
import type { Tile, Furo } from '@/types';

let nextId = 0;
function tile(suit: Tile['suit'], value: number): Tile {
  return { id: `ittsu-${nextId++}`, suit, value };
}

function openIttsuState() {
  // 123m is exposed; 456m + 789m remain concealed.
  // 23p + 55s waits for 1p/4p. Winning on 4p forms open ittsu (1 han).
  const called = tile('man', 3);
  const furo: Furo = {
    type: 'chii',
    tiles: [tile('man', 1), tile('man', 2), called],
    calledTile: called,
  };
  const hand = [
    tile('man', 4), tile('man', 5), tile('man', 6),
    tile('man', 7), tile('man', 8), tile('man', 9),
    tile('pin', 2), tile('pin', 3),
    tile('sou', 5), tile('sou', 5),
  ];
  const winning = tile('pin', 4);
  const indicator = tile('dragon', 3); // White dragon dora, absent from hand.
  const wanpai = [
    ...Array.from({ length: 4 }, () => tile('wind', 4)),
    indicator,
    ...Array.from({ length: 9 }, () => tile('wind', 4)),
  ];
  const state = {
    ...makeInitialStateBase(hand, [], [winning, tile('wind', 1)], wanpai),
    playerFuro: [furo],
    roundWind: 'east' as const,
    playerWind: 'south' as const,
    phase: 'cpuTurn' as const,
    turnCount: 4,
  };
  return { state, winning };
}

describe('open ittsu ron regression', () => {
  it('recognizes the completed shape even with an exposed chi', () => {
    const { state, winning } = openIttsuState();
    expect(canRonConcealed(state.playerHand, winning, state.playerFuro.length)).toBe(true);
  });

  it('scores open ittsu as a valid ron', () => {
    const { state, winning } = openIttsuState();
    const scored = scoreHand({
      ...state, phase: 'win', winType: 'ron', winTile: winning,
      lastCpuDiscard: winning,
    });
    expect(scored?.valid, JSON.stringify(scored?.errors)).toBe(true);
    expect(scored?.handInterpretations.some(h => h.yaku.some(y => y.name === 'ittsu'))).toBe(true);
    expect(canRonWithYaku(state, winning)).toBe(true);
  });

  it('offers the ron button when CPU discards the winning tile', () => {
    const { state } = openIttsuState();
    const afterCpu = applyCpuTurn(state);
    expect(afterCpu?.phase).toBe('naki');
    expect(afterCpu?.ronAvailable).toBe(true);
  });
});
