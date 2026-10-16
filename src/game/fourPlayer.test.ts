import { describe, expect, it } from 'vitest';
import type { Tile } from '@/types';
import { makeInitialState, makeInitialStateBase, type State } from '@/game/gameState';
import { SEATS, seatAfter, playerDrawOffset, isPlayerWallIndex } from '@/game/seatFlow';
import { applyCpuTurn, applyPassNaki, applyPlayerDraw, applyCallRon, applyCallNaki, applyPlayerNakiDiscard } from '@/game/transitions';
import { buildNotenReplay, buildSolverReplay } from '@/game/solverReplay';
import { evaluateCandidateWins } from '@/game/candidateReplay';
import { findCandidateSolution } from '@/game/candidateSolution';
import { scoreHand } from '@/game/scoreAdapter';
import { asFourPlayerTestState, makeTwoAnkanTestState } from '@/game/testScenarios';
import { searchWithAnkan } from '@/game/ankanSearch';

let serial = 0;
const tile = (suit: Tile['suit'], value: number): Tile => ({ suit, value, id: `four-${serial++}` });
const waitingHand = () => [
  ...[1,2,3].map(v => tile('man',v)), ...[1,2,3].map(v => tile('pin',v)),
  ...[1,2,3,7,9].map(v => tile('sou',v)), tile('dragon',1), tile('dragon',1),
];
function fixture(hand = waitingHand(), wall = [tile('sou',8), tile('wind',1), tile('wind',2), tile('wind',3), tile('wind',4)]): State {
  return { ...makeInitialStateBase(hand, [], wall, [], 'south', 'west'),
    mode: 'four', roundWind: 'east', nextSeat: 'west', phase: 'cpuTurn', isRiichi: true,
    opponents: SEATS.filter(wind => wind !== 'south').map(wind => ({ wind, hand: [], discards: [] })),
  };
}

describe('four-player mode', () => {
  it('deals 136 unique tiles with three concealed hands and a 70-tile wall', () => {
    const state = makeInitialState('four');
    const all = [...state.playerHand, ...state.opponents!.flatMap(p => p.hand), ...state.wall, ...state.wanpai];
    expect(state.opponents).toHaveLength(3);
    expect(state.opponents!.every(p => p.hand.length === 13 && p.wind !== state.playerWind)).toBe(true);
    expect(state.wall).toHaveLength(70);
    expect(all).toHaveLength(136);
    expect(new Set(all.map(t => t.id)).size).toBe(136);
    expect(state.nextSeat).toBe('east');
  });

  it.each(SEATS)('plays a full wall in seat order when the player is %s', playerWind => {
    const initial = { ...makeInitialState('four'), playerWind, nextSeat: 'east' as const,
      phase: playerWind === 'east' ? 'playerDraw' as const : 'cpuTurn' as const,
      opponents: SEATS.filter(wind => wind !== playerWind).map(wind => ({ wind, hand: [], discards: [] })),
    };
    expect(playerDrawOffset(initial)).toBe(SEATS.indexOf(playerWind));
    const frames = buildNotenReplay(initial);
    const final = frames[frames.length - 1].state;
    expect(final.phase).toBe('exhausted');
    expect(final.wallDrawnCount).toBe(70);
    expect(final.playerDiscards).toHaveLength(['east','south'].includes(playerWind) ? 18 : 17);
    for (const opponent of final.opponents!) {
      expect(opponent.discards).toEqual(initial.wall.filter((_, i) => SEATS[i % 4] === opponent.wind));
    }
  });

  it.each(['east','west','north'] as const)('allows ron from %s and retains the scoring source', wind => {
    const initial = { ...fixture(), nextSeat: wind };
    const offered = applyCpuTurn(initial)!;
    expect(offered.ronAvailable).toBe(true);
    expect(offered.opponents!.find(p => p.wind === wind)!.discards[0].id).toBe(initial.wall[0].id);
    const won = applyCallRon(offered)!;
    expect(won.winFromWind).toBe(wind);
    expect(scoreHand(won)?.valid).toBe(true);
  });

  it('blocks ron on all other seats after passing, until the next own draw', () => {
    let state = fixture(waitingHand(), [tile('sou',8),tile('sou',8),tile('sou',8),tile('wind',1)]);
    state.isRiichi = false;
    state = applyPassNaki(applyCpuTurn(state)!)!;
    expect(state.temporaryFuriten).toBe(true);
    expect(state.phase).toBe('cpuTurn');
    for (let i=0; i<2; i++) {
      state = applyCpuTurn(state)!;
      expect(state.ronAvailable).toBe(false);
      if (state.phase === 'naki') state = applyPassNaki(state)!;
    }
    expect(state.phase).toBe('playerDraw');
    state = applyPlayerDraw(state)!;
    expect(state.temporaryFuriten).toBe(false);
  });

  it.each(['east','west','north'] as const)('limits chii to upstream and routes a pon from %s to the next player seat', wind => {
    const hand = [tile('man',1),tile('man',2),tile('man',3),tile('man',3), ...Array.from({length:9}, () => tile('pin',9))];
    const state = { ...fixture(hand, [tile('man',3),tile('sou',1),tile('sou',2)]), nextSeat:wind, isRiichi:false };
    const offered = applyCpuTurn(state)!;
    expect(offered.nakiOptions.some(o => o.type === 'chii')).toBe(wind === 'east');
    const pon = offered.nakiOptions.find(o => o.type === 'pung')!;
    expect(pon).toBeDefined();
    const called = applyCallNaki(offered, pon)!;
    expect(called.playerFuro[0].fromWind).toBe(wind);
    expect(called.nextSeat).toBe('west');
    expect(applyPlayerNakiDiscard(called, called.playerHand[0])!.phase).toBe('cpuTurn');
  });

  it.each([0,1,2,3])('searches only the player draw lane with offset %s and replays its win', offset => {
    const wall = [tile('wind',1),tile('wind',2),tile('wind',3),tile('wind',4),tile('sou',8),tile('wind',1),tile('wind',2),tile('wind',3)];
    [wall[offset], wall[4]] = [wall[4], wall[offset]];
    const initial = { ...fixture(waitingHand(), wall), nextSeat: seatAfter('south', 4-offset),
      phase: offset === 0 ? 'playerDraw' as const : 'cpuTurn' as const };
    expect(isPlayerWallIndex(initial, offset)).toBe(true);
    const wins = evaluateCandidateWins(initial);
    expect(wins.some(w => w.opportunity.type === 'tsumo' && w.opportunity.wallIndex === offset && w.score !== null)).toBe(true);
    const result = findCandidateSolution(initial)!;
    expect(result?.outcome).toBe('win');
    const frames = buildSolverReplay(initial, result);
    expect(frames).toHaveLength(result.line.length+1);
    expect(frames[frames.length - 1].state.phase).toBe('win');
  });

  it.each([false, true])('preserves fixture draws and replays two kans (chained=%s)', chained => {
    const original = makeTwoAnkanTestState(chained);
    const initial = asFourPlayerTestState(original);
    const tiles = [...initial.playerHand, ...initial.opponents!.flatMap(p => p.hand), ...initial.wall, ...initial.wanpai];
    expect(new Set(tiles.map(t => t.id)).size).toBe(tiles.length);
    expect(initial.wall.filter((_, i) => isPlayerWallIndex(initial, i)).map(t => t.id))
      .toEqual(original.wall.filter((_, i) => i % 2 === 0).map(t => t.id));
    const result = searchWithAnkan(initial, null)!;
    expect(result?.outcome).toBe('win');
    expect(result.line.filter(a => a.type === 'ankan')).toHaveLength(2);
    const frames = buildSolverReplay(initial, result);
    expect(frames).toHaveLength(result.line.length+1);
    expect(frames[frames.length - 1].state.phase).toBe('win');
    expect(frames[frames.length - 1].state.playerFuro).toHaveLength(2);
  });
});
