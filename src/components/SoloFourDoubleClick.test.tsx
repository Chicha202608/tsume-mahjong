import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MouseEvent, ReactElement } from 'react';
import { createDeck } from '@/gameLogic';
import { createSoloState, type SoloHistory } from '@/game/soloFour';
import SoloFourGame from '@/components/SoloFourGame';

const hooks = vi.hoisted(() => ({
  history: null as SoloHistory | null,
  dispatch: vi.fn(),
  showWall: false,
  stateIndex: 0,
  lastAction: { current: -Infinity },
}));

// Read the actual component's event handler without needing a browser DOM.
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useReducer: () => [hooks.history, hooks.dispatch],
  useState: (initial: unknown) => [hooks.stateIndex++ === 1 ? hooks.showWall : initial, vi.fn()],
  useMemo: (compute: () => unknown) => compute(),
  useEffect: () => {},
  useRef: () => hooks.lastAction,
}));

function doubleClick(interactive = false) {
  hooks.stateIndex = 0;
  const root = SoloFourGame({ onHome: () => {} });
  const wrapper = root.props.children as ReactElement;
  const surface = wrapper.props.children as ReactElement;
  const event = {
    target: { closest: () => interactive ? {} : null },
    preventDefault: vi.fn(),
  };
  surface.props.onDoubleClickCapture(event as unknown as MouseEvent<HTMLDivElement>);
  return event;
}

beforeEach(() => {
  hooks.history = { entries: [{ state: createSoloState(createDeck()) }], index: 0, pending: null };
  hooks.dispatch.mockClear();
  hooks.showWall = false;
  hooks.lastAction.current = -Infinity;
});

describe('solo four-player background double click', () => {
  it.each([false, true])('discards the drawn tile (riichi: %s)', riichi => {
    const state = hooks.history!.entries[0].state;
    state.seats.east.riichi = riichi;
    const tileId = state.seats.east.drawn!.id;
    expect(doubleClick().preventDefault).toHaveBeenCalledOnce();
    expect(hooks.dispatch).toHaveBeenCalledOnce();
    expect(hooks.dispatch).toHaveBeenCalledWith({ type: 'act', action: { type: 'discard', tileId } });
  });

  it('passes only the current response and prevents an immediate second action', () => {
    const state = hooks.history!.entries[0].state;
    state.phase = 'response';
    state.view = 'south';
    state.pending = { kind: 'discard', source: 'east', tile: state.seats.east.drawn!, responses: [
      { wind: 'south', ron: false, options: [] },
      { wind: 'west', ron: false, options: [] },
    ] };
    doubleClick();
    doubleClick();
    expect(hooks.dispatch).toHaveBeenCalledOnce();
    expect(hooks.dispatch).toHaveBeenCalledWith({ type: 'act', action: { type: 'respond', choice: 'pass' } });
  });

  it.each(['interactive', 'wall', 'past', 'confirmation', 'riichi selection', 'after call', 'end'])(
    'ignores double clicks during %s', context => {
      const history = hooks.history!;
      const state = history.entries[0].state;
      if (context === 'wall') hooks.showWall = true;
      if (context === 'past') history.entries.push({ state });
      if (context === 'confirmation') history.pending = { state, action: { type: 'discard', tileId: state.seats.east.drawn!.id } };
      if (context === 'riichi selection') state.phase = 'riichi';
      if (context === 'after call') state.seats.east.drawn = null;
      if (context === 'end') state.phase = 'end';
      expect(doubleClick(context === 'interactive').preventDefault).not.toHaveBeenCalled();
      expect(hooks.dispatch).not.toHaveBeenCalled();
    },
  );
});
