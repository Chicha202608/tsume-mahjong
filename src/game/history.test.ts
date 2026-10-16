import { describe, expect, it } from 'vitest';
import { findMattaIndex, findPrevStopIndex } from '@/game/history';
import { makeTwoAnkanTestState, asFourPlayerTestState, makeRiichiAnkanTestState } from '@/game/testScenarios';
import { applyPlayerDraw, applyDeclareRiichi, applyRiichiDiscard } from '@/game/transitions';
import { buildNotenReplay } from '@/game/solverReplay';

describe('riichi undo', () => {
  it.each(['two', 'four'] as const)('returns to declaration discard selection even many turns later (%s)', mode => {
    const fixture = makeTwoAnkanTestState();
    const initial = mode === 'four' ? asFourPlayerTestState(fixture) : fixture;
    const drawn = applyPlayerDraw(initial)!;
    const selection = applyDeclareRiichi(drawn)!;
    const declared = applyRiichiDiscard(selection, selection.playerDrawnTile!)!;
    const history = [initial, drawn, selection, ...buildNotenReplay(declared).map(f => f.state)];
    expect(history[history.length - 1].phase).toBe('exhausted');
    for (let i = 3; i < history.length; i++) {
      expect(history[i].isRiichi).toBe(true);
      expect(findMattaIndex(history, i)).toBe(2);
    }
    const target = findMattaIndex(history, history.length - 1);
    const rewound = history.slice(0, target + 1);
    expect(rewound[rewound.length - 1]).toBe(selection);
    expect(selection.isRiichi).toBe(false);
    expect(selection.playerDiscards).toHaveLength(0);
    expect(selection.playerDrawnTile).toBe(drawn.playerDrawnTile);
    const alternate = selection.playerHand.find(t => t.suit === 'man' && t.value === 1)!;
    const changed = applyRiichiDiscard(selection, alternate)!;
    expect(changed.playerDiscards[0]).toBe(alternate);
    expect(changed.playerHand.some(t => t.id === drawn.playerDrawnTile!.id)).toBe(true);
  });

  it('preserves normal undo and Back navigation', () => {
    const initial = makeTwoAnkanTestState();
    const drawn = applyPlayerDraw(initial)!;
    const selection = applyDeclareRiichi(drawn)!;
    const declared = applyRiichiDiscard(selection, selection.playerDrawnTile!)!;
    const history = [initial, drawn, selection, ...buildNotenReplay(declared).map(f => f.state)];
    expect(findMattaIndex(history, 1)).toBe(findPrevStopIndex(history, 1));
    expect(findMattaIndex(history, 2)).toBe(1);
    expect(findPrevStopIndex(history, history.length - 1)).toBeGreaterThan(2);
    expect(findMattaIndex(history, 0)).toBe(0);
  });

  it('falls back safely for a test fixture that starts after declaring riichi', () => {
    const history = buildNotenReplay(makeRiichiAnkanTestState()).map(f => f.state);
    expect(findMattaIndex(history, history.length - 1)).toBe(findPrevStopIndex(history, history.length - 1));
  });
});
