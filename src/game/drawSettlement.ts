import type { State } from '@/game/gameState';
import { checkTenpai } from '@/gameLogic';
import { enumerateTenpaiCandidates } from '@/game/tenpaiCandidates';

export const TENPAI_DRAW_POINTS = 3000;

/** This app awards the sole-tenpai payment in either player-count mode. */
export function drawSettlement(state: State): { tenpai: boolean; score: number } | null {
  if (state.phase !== 'exhausted') return null;
  // Use the search's closed-hand shapes, including seven pairs and kokushi.
  const tenpai = state.playerFuro.length === 0
    ? enumerateTenpaiCandidates({ ...state, wall: [], playerDrawnTile: null }).length > 0
    : checkTenpai(state.playerHand, state.playerFuro.length);
  return { tenpai, score: tenpai ? TENPAI_DRAW_POINTS : 0 };
}
