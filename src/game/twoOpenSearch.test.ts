import { describe, expect, it } from 'vitest';
import { makeTwoOpenHanemanTestState } from '@/game/testScenarios';
import { searchWithOneOpenCall, searchWithOpenCalls, type OpenSearchStats } from '@/game/openSearch';
import { findBestNoKanSolution } from '@/game/drawSolution';
import { searchWithAnkan } from '@/game/ankanSearch';
import { buildSolverReplay } from '@/game/solverReplay';
import { scoreHand } from '@/game/scoreAdapter';
import { createDeck, sortHand } from '@/gameLogic';
import { makeInitialStateBase, type State } from '@/game/gameState';
import type { SolverResult } from '@/game/solver';

function verify(initial: State, result: SolverResult, calls = 2) {
  const frames = buildSolverReplay(initial,result);
  expect(frames.length).toBe(result.line.length+1);
  const end = frames[frames.length-1].state;
  expect(end.phase).toBe('win');
  expect(end.playerFuro).toHaveLength(calls);
  expect(end.playerFuro.every(f => f.type === 'chii' || f.type === 'pung')).toBe(true);
  expect(result.bestScore).toBe(Math.max(...scoreHand(end)!.handInterpretations.map(h => h.totalWinnings)));
  for (const { state } of frames) {
    const tiles = [...state.playerHand,...(state.playerDrawnTile ? [state.playerDrawnTile] : []),
      ...state.playerFuro.flatMap(f => f.tiles),...state.playerDiscards];
    expect(new Set(tiles.map(t => t.id)).size).toBe(tiles.length);
    expect(state.playerFuro.length).toBeLessThanOrEqual(2);
    expect(state.isRiichi).toBe(false);
  }
  return frames;
}

describe('up to two open calls', () => {
  for (const mode of ['two','four'] as const) {
    it.each(['pon-pon','chi-chi','pon-chi','chi-pon'] as const)(`requires two calls for %s in ${mode}-player mode`, kind => {
      const initial = makeTwoOpenHanemanTestState(kind,mode);
      const before = JSON.stringify(initial);
      const closed = searchWithAnkan(initial,findBestNoKanSolution(initial),8000,2);
      const one = searchWithOneOpenCall(initial,closed);
      expect(one?.bestScore ?? 0).toBeLessThan(12000);
      let stats: OpenSearchStats | undefined;
      const two = searchWithOpenCalls(initial,closed,8000,2,s => { stats = s; })!;
      expect(two.bestScore).toBe(12000);
      const frames = verify(initial,two);
      const calls = frames.filter(f => f.action?.type === 'call-naki');
      expect(calls.map(f => f.state.wallDrawnCount)).toEqual(
        [1, mode === 'four' && kind.endsWith('chi') ? 4 : 2]);
      if (mode === 'four' && kind.endsWith('chi')) expect(calls[1].state.lastDiscardWind).toBe('east');
      expect(stats!.twoCallCandidates).toBeGreaterThan(0);
      expect(stats!.timeLimitReached).toBe(false);
      expect(JSON.stringify(initial)).toBe(before);
    });
  }
  it('keeps a closed hand at equal points', () => {
    const initial = makeTwoOpenHanemanTestState();
    const baseline: SolverResult = { supported:true,complete:false,outcome:'win',bestScore:12000,line:[],
      stats:{statesVisited:0,cacheHits:0,prunedBranches:0,elapsedMs:0} };
    expect(searchWithOpenCalls(initial,baseline)).toBe(baseline);
  });
  it('retains a found line when no time remains', () => {
    const initial = makeTwoOpenHanemanTestState();
    const result = searchWithOpenCalls(initial,null)!;
    let stats: OpenSearchStats | undefined;
    expect(searchWithOpenCalls(initial,result,0,2,s => { stats = s; })).toBe(result);
    expect(stats!.timeLimitReached).toBe(true);
    expect(stats!.callCandidates).toBe(0);
  });
  it('takes the next own draw from the timeline after the second pon', () => {
    const initial = makeTwoOpenHanemanTestState();
    const wall = [...initial.wall];
    [wall[2],wall[5]] = [wall[5],wall[2]];
    const state = { ...initial,wall,fullWall:wall };
    const result = searchWithOpenCalls(state,null)!;
    const frames = verify(state,result);
    const end = frames[frames.length-1].state;
    expect(end.winType).toBe('tsumo');
    expect(end.wallDrawnCount).toBe(6);
  });
  it('can acquire the second pon tile on the shifted own draw after the first call', () => {
    const initial = makeTwoOpenHanemanTestState();
    const hand = [...initial.playerHand];
    const index = hand.findIndex(t => t.suit === 'dragon' && t.value === 2);
    const acquired = hand[index];
    hand[index] = initial.wall[4];
    const w = initial.wall;
    const wall = [w[0],w[3],w[5],w[6],acquired,w[1],w[2]];
    const state = { ...initial,playerHand:sortHand(hand),wall,fullWall:wall };
    const result = searchWithOpenCalls(state,null)!;
    const frames = verify(state,result);
    const second = frames.filter(f => f.action?.type === 'call-naki')[1];
    expect(second.state.wallDrawnCount).toBe(6);
    expect(second.state.playerFuro[1].tiles.some(t => t.id === acquired.id)).toBe(true);
  });
  it('does not chi the second meld from a downstream discard', () => {
    const initial = makeTwoOpenHanemanTestState('chi-chi');
    const wall = [initial.wall[0],...initial.wall.slice(3)];
    expect(searchWithOpenCalls({ ...initial,wall,fullWall:wall },null)).toBeNull();
  });
  it.each([20261016,20261017])('bounds a full wall and reaches the two-call stage (seed %i)', seedValue => {
    const deck = createDeck();
    let seed = seedValue;
    for (let i = deck.length-1; i > 0; i--) {
      seed = (Math.imul(seed,1664525)+1013904223) >>> 0;
      const j = Math.floor(seed / 4294967296 * (i+1));
      [deck[i],deck[j]] = [deck[j],deck[i]];
    }
    const hand = sortHand(deck.splice(0,13));
    const opponents = deck.splice(0,39);
    const wanpai = deck.splice(0,14);
    const state: State = { ...makeInitialStateBase(hand,opponents.slice(0,13),deck,wanpai,'south','east'),
      mode:'four',nextSeat:'east',roundWind:'east' };
    let stats: OpenSearchStats | undefined;
    const results: number[] = [];
    const result = searchWithOpenCalls(state,null,2000,2,s => { stats = s; },r => results.push(r?.bestScore ?? 0));
    expect(stats!.twoCallCandidates).toBeGreaterThan(0);
    expect(results.every((v,i) => i === 0 || v >= results[i-1])).toBe(true);
    if (result) verify(state,result,result.line.filter(a => a.type === 'call-naki').length);
    console.info('[two-open-call]',seedValue,stats,result?.bestScore);
  });
});
