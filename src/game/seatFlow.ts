import type { Wind } from '@/types';
import type { State } from '@/game/gameState';

export const SEATS: Wind[] = ['east', 'south', 'west', 'north'];
export const activeSeats = (state: State): Wind[] => state.mode === 'three' ? SEATS.slice(0, 3) : SEATS;
export const isTableMode = (state: State) => state.mode === 'three' || state.mode === 'four';
export const nextSeat = (state: State, wind: Wind, steps = 1): Wind => {
  const seats = activeSeats(state);
  return seats[(seats.indexOf(wind) + steps % seats.length + seats.length) % seats.length];
};
export const windLetter = (wind: Wind) => wind[0].toUpperCase();
export const seatAfter = (wind: Wind, steps = 1): Wind => SEATS[(SEATS.indexOf(wind) + steps + 4) % 4];
export const drawStride = (state: State) => isTableMode(state) ? activeSeats(state).length : 2;

/** Offset of the next normal player draw in the current remaining wall. */
export function playerDrawOffset(state: State): number {
  if (isTableMode(state)) {
    const seats = activeSeats(state);
    return (seats.indexOf(state.playerWind) - seats.indexOf(state.nextSeat ?? state.playerWind) + seats.length) % seats.length;
  }
  return state.phase === 'playerDraw' || state.phase === 'naki' ? 0 : 1;
}
export const isPlayerWallIndex = (state: State, index: number) => index % drawStride(state) === playerDrawOffset(state);
export const wallSeatAt = (state: State, index: number): Wind => isTableMode(state)
  ? nextSeat(state, state.nextSeat ?? state.playerWind, index)
  : isPlayerWallIndex(state, index) ? state.playerWind : state.cpuWind;
export const hasFuturePlayerDraw = (state: State) => playerDrawOffset(state) < state.wall.length;
export const afterCpuPhase = (state: State): 'cpuTurn' | 'playerDraw' =>
  isTableMode(state) && state.nextSeat !== state.playerWind ? 'cpuTurn' : 'playerDraw';
