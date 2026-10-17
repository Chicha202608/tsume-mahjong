import type { State } from '@/game/gameState';
import type { SolverAction, SolverResult } from '@/game/solver';
import {
  applyPlayerDraw, applyCpuTurn, applyPlayerDiscard, applyPassTsumo,
  applyPassNaki, applyCallRon, applyDeclareTsumo, applyDeclareKan,
  applyCallNaki, applyPlayerNakiDiscard,
} from '@/game/transitions';

export interface ReplayFrame {
  state: State;
  action: SolverAction | null;
}

/** Read-only states; never mutates the player's actual game history. */
export function buildSolverReplay(initial: State, result: SolverResult): ReplayFrame[] {
  if ((!result.complete && result.line.length === 0) || !result.supported) return [];
  const frames: ReplayFrame[] = [{ state: initial, action: null }];
  let state = initial;
  for (const action of result.line) {
    let next: State | null = null;
    switch (action.type) {
      case 'draw': next = applyPlayerDraw(state); break;
      case 'cpu-turn': next = applyCpuTurn(state); break;
      case 'ankan':
      case 'kakan': next = applyDeclareKan(state, action.option); break;
      case 'call-naki': next = action.option.type === 'daiminkan'
        ? applyDeclareKan(state, action.option) : applyCallNaki(state, action.option); break;
      case 'discard': {
        // Mark last-moment riichi only when a legal declaration is actually possible.
        // The solver's scoring convention is retained in this replay.
        next = state.phase === 'playerNakiDiscard'
          ? applyPlayerNakiDiscard(state, action.tile) : applyPlayerDiscard(state, action.tile);
        if (next && action.riichi && !next.isRiichi) next = { ...next, isRiichi: true, isIppatsu: true };
        break;
      }
      case 'pass-tsumo': next = applyPassTsumo(state); break;
      case 'pass-naki': next = applyPassNaki(state); break;
      case 'ron':
        next = applyCallRon(state) ?? (state.mode === 'four' ? null : (
          { ...state, phase: 'win', winType: 'ron',
            winTile: action.tile, lastCpuDiscard: action.tile, ronAvailable: false }
        ));
        if (next && action.riichi && !next.isRiichi) next = { ...next, isRiichi: true, isIppatsu: true };
        break;
      case 'tsumo':
        next = applyDeclareTsumo(state) ?? (
          state.playerDrawnTile ? { ...state, phase: 'win', winType: 'tsumo',
            winTile: state.playerDrawnTile, tsumoAvailable: false } : null
        );
        if (next && action.riichi && !next.isRiichi) next = { ...next, isRiichi: true, isIppatsu: true };
        break;
      default: return frames;
    }
    if (!next) return frames;
    state = next;
    frames.push({ state, action });
  }
  return frames;
}

/** Noten display line: discard each drawn tile, declining calls and wins. */
export function buildNotenReplay(initial: State): ReplayFrame[] {
  const frames: ReplayFrame[] = [{ state: initial, action: null }];
  let state = initial;
  for (let i = 0; i < 320 && state.phase !== 'exhausted'; i++) {
    let action: SolverAction;
    let next: State | null;
    if (state.phase === 'playerDraw') {
      action = { type: 'draw' };
      next = applyPlayerDraw(state);
    } else if (state.phase === 'cpuTurn') {
      action = { type: 'cpu-turn' };
      next = applyCpuTurn(state);
    } else if (state.phase === 'naki') {
      action = { type: 'pass-naki' };
      next = applyPassNaki(state);
    } else if (state.phase === 'playerDiscard' && state.tsumoAvailable) {
      action = { type: 'pass-tsumo' };
      next = applyPassTsumo(state);
    } else if (state.phase === 'playerDiscard' && state.playerDrawnTile) {
      action = { type: 'discard', tile: state.playerDrawnTile };
      next = applyPlayerDiscard(state, state.playerDrawnTile);
    } else break;
    if (!next) break;
    state = next;
    frames.push({ state, action });
  }
  return frames;
}
