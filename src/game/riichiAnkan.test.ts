import { describe, expect, it } from 'vitest';
import { findAnkanOptions, findLegalAnkanOptions } from '@/gameLogic';
import { makeInitialStateBase } from '@/game/gameState';
import { applyDeclareKan, applyPlayerDraw, applyPlayerDiscard } from '@/game/transitions';
import { makeRiichiAnkanTestState } from '@/game/testScenarios';
import type { Tile } from '@/types';

let counter = 0;
const t = (suit: Tile['suit'], value: number): Tile => ({
  id: String(++counter), suit, value,
});

describe('riichi ankan debug setup', () => {
  it('draws the fourth 1m and allows either a legal ankan or tsumogiri', () => {
    const initial = makeRiichiAnkanTestState();
    expect(initial.isRiichi).toBe(true);
    expect(initial.phase).toBe('playerDraw');
    expect(initial.playerHand.filter(tile => tile.suit === 'man' && tile.value === 1)).toHaveLength(3);

    const afterDraw = applyPlayerDraw(initial);
    expect(afterDraw?.phase).toBe('playerDiscard');
    expect(afterDraw?.playerDrawnTile).toMatchObject({ suit: 'man', value: 1 });
    expect(afterDraw?.tsumoAvailable).toBe(false);
    if (!afterDraw || !afterDraw.playerDrawnTile) throw new Error('Test scenario could not draw');

    const options = findLegalAnkanOptions(afterDraw.playerHand, afterDraw.playerDrawnTile, afterDraw.playerFuro, afterDraw.isRiichi);
    expect(options).toHaveLength(1);
    expect(applyDeclareKan(afterDraw, options[0])?.playerFuro[0]?.type).toBe('ankan');
    expect(applyPlayerDiscard(afterDraw, afterDraw.playerDrawnTile)?.playerDiscards).toHaveLength(1);
  });
});

describe('riichi concealed-kan availability', () => {
  it('offers a kan of the drawn fourth tile when the waits remain the same', () => {
    // Three concealed 1m, sequences 234p/345s/678s and a 5p single wait.
    const hand = [
      t('man', 1), t('man', 1), t('man', 1),
      t('pin', 2), t('pin', 3), t('pin', 4),
      t('sou', 3), t('sou', 4), t('sou', 5),
      t('sou', 6), t('sou', 7), t('sou', 8),
      t('pin', 5),
    ];
    const drawn = t('man', 1);
    const options = findLegalAnkanOptions(hand, drawn, [], true);
    expect(options).toHaveLength(1);
    expect(options[0].tiles.some(tile => tile.id === drawn.id)).toBe(true);
    const state = {
      ...makeInitialStateBase(hand, [], [t('pin', 8)], [
        ...Array.from({ length: 14 }, () => t('wind', 1)),
      ]),
      phase: 'playerDiscard' as const,
      isRiichi: true,
      playerDrawnTile: drawn,
    };
    const after = applyDeclareKan(state, options[0]);
    expect(after?.playerFuro[0]?.type).toBe('ankan');
    expect(after?.isRiichi).toBe(true);
  });

  it('forbids declaring a concealed kan using old hand tiles instead of the draw', () => {
    const hand = [
      t('man', 1), t('man', 1), t('man', 1), t('man', 1),
      t('pin', 2), t('pin', 3), t('pin', 4),
      t('sou', 3), t('sou', 4), t('sou', 5),
      t('sou', 6), t('sou', 7), t('sou', 8),
    ];
    const drawn = t('pin', 9);
    expect(findAnkanOptions(hand, drawn)).toHaveLength(1);
    expect(findLegalAnkanOptions(hand, drawn, [], true)).toHaveLength(0);
    const state = {
      ...makeInitialStateBase(hand, [], [], Array.from({ length: 14 }, () => t('wind', 1))),
      phase: 'playerDiscard' as const,
      isRiichi: true,
      playerDrawnTile: drawn,
    };
    expect(applyDeclareKan(state, findAnkanOptions(hand, drawn)[0])).toBeNull();
  });

  it('allows all ordinary concealed-kan candidates before riichi', () => {
    const hand = [
      t('man', 1), t('man', 1), t('man', 1), t('man', 1),
      t('pin', 2), t('pin', 3), t('pin', 4),
      t('sou', 3), t('sou', 4), t('sou', 5),
      t('sou', 6), t('sou', 7), t('sou', 8),
    ];
    const drawn = t('pin', 9);
    expect(findLegalAnkanOptions(hand, drawn, [], false)).toHaveLength(1);
  });
});
