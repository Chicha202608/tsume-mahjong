import type { Wind } from '@/types';
import type { State } from '@/game/gameState';

export const SEATS: Wind[] = ['east', 'south', 'west', 'north'];
export const windLetter = (wind: Wind) => wind[0].toUpperCase();
export const seatAfter = (wind: Wind, steps = 1): Wind => SEATS[(SEATS.indexOf(wind) + steps + 4) % 4];
export const drawStride = (state: State) => state.mode === 'four' ? 4 : 2;

/** Offset of the next normal player draw in the current remaining wall. */
export function playerDrawOffset(state: State): number {
  if (state.mode === 'four') return (SEATS.indexOf(state.playerWind) - SEATS.indexOf(state.nextSeat ?? state.playerWind) + 4) % 4;
  return state.phase === 'playerDraw' || state.phase === 'naki' ? 0 : 1;
}
export const isPlayerWallIndex = (state: State, index: number) => index % drawStride(state) === playerDrawOffset(state);
export const wallSeatAt = (state: State, index: number): Wind => state.mode === 'four'
  ? seatAfter(state.nextSeat ?? state.playerWind, index % 4)
  : isPlayerWallIndex(state, index) ? state.playerWind : state.cpuWind;
export const hasFuturePlayerDraw = (state: State) => playerDrawOffset(state) < state.wall.length;
export const afterCpuPhase = (state: State): 'cpuTurn' | 'playerDraw' =>
  state.mode === 'four' && state.nextSeat !== state.playerWind ? 'cpuTurn' : 'playerDraw';
