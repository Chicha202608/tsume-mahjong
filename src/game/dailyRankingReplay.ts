import { canRiichi, findKakanOptions, findLegalAnkanOptions, isMenzen, validRiichiDiscards, type NakiOption } from '../gameLogic';
import { makeDailyRound } from './dailyRound';
import { drawSettlement } from './drawSettlement';
import type { State } from './gameState';
import { scoreHand } from './scoreAdapter';
import {
  applyCallNaki, applyCallRon, applyCpuTurn, applyDeclareKan, applyDeclareRiichi,
  applyDeclareTsumo, applyPassNaki, applyPassTsumo, applyPlayerDiscard, applyPlayerDraw,
  applyPlayerNakiDiscard, applyRiichiDiscard,
} from './transitions';

export const maxRankingMoves = 150;

export function rankingCall(option: NakiOption): string {
  return `${option.type}:${option.tiles.map(tile => tile.id).sort().join(',')}`;
}

function applyMove(state: State, move: string): State | null {
  if (state.phase === 'naki') {
    if (move === 'ron') return applyCallRon(state);
    if (move === 'passNaki') return applyPassNaki(state);
    const option = state.nakiOptions.find(candidate => rankingCall(candidate) === move);
    if (!option) return null;
    return option.type === 'daiminkan' ? applyDeclareKan(state, option) : applyCallNaki(state, option);
  }

  const drawn = state.playerDrawnTile;
  if (state.phase === 'playerDiscard' && drawn) {
    if (move === 'tsumo') return applyDeclareTsumo(state);
    if (move === 'passTsumo') return applyPassTsumo(state);
    if (move === 'riichi') {
      return !state.isRiichi && isMenzen(state.playerFuro) && canRiichi(state.playerHand, drawn, state.playerFuro)
        ? applyDeclareRiichi(state) : null;
    }
    const kanOptions = findLegalAnkanOptions(state.playerHand, drawn, state.playerFuro, state.isRiichi);
    if (!state.isRiichi) kanOptions.push(...findKakanOptions(state.playerHand, drawn, state.playerFuro));
    const option = kanOptions.find(candidate => rankingCall(candidate) === move);
    if (option) return applyDeclareKan(state, option);
  }

  if (!move.startsWith('discard:')) return null;
  const id = move.slice('discard:'.length);
  const tile = drawn?.id === id ? drawn : state.playerHand.find(candidate => candidate.id === id);
  if (!tile) return null;
  if (state.phase === 'playerNakiDiscard') return applyPlayerNakiDiscard(state, tile);
  if (state.phase === 'playerDiscard') return applyPlayerDiscard(state, tile);
  if (state.phase === 'riichiSelect' && drawn && validRiichiDiscards(state.playerHand, drawn, state.playerFuro).has(id)) {
    return applyRiichiDiscard(state, tile);
  }
  return null;
}

export function replayDailyScore(date: string, moves: readonly string[]): number | null {
  if (moves.length > maxRankingMoves) return null;
  let state = makeDailyRound(date);
  let moveIndex = 0;
  // Every CPU turn/draw consumes a wall tile. The extra headroom also covers the player's decisions.
  for (let step = 0; step <= state.fullWall.length + maxRankingMoves; step++) {
    if (state.phase === 'win' || state.phase === 'exhausted') {
      if (moveIndex !== moves.length) return null;
      const settlement = drawSettlement(state);
      if (settlement) return settlement.score;
      const result = scoreHand(state);
      return result?.valid && result.handInterpretations.length
        ? Math.max(...result.handInterpretations.map(hand => hand.totalWinnings)) : null;
    }

    let next: State | null;
    if (state.phase === 'cpuTurn') next = applyCpuTurn(state);
    else if (state.phase === 'playerDraw') next = applyPlayerDraw(state);
    else {
      const move = moves[moveIndex++];
      if (move === undefined) return null;
      next = applyMove(state, move);
    }
    if (!next) return null;
    state = next;
  }
  return null;
}
