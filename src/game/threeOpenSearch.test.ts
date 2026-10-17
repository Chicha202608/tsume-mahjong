import { describe, expect, it } from 'vitest';
import { makeThreeOpenHanemanTestState } from '@/game/testScenarios';
import { searchWithOpenCalls, type OpenSearchStats } from '@/game/openSearch';
import { findBestNoKanSolution } from '@/game/drawSolution';
import { searchWithAnkan } from '@/game/ankanSearch';
import { buildSolverReplay } from '@/game/solverReplay';
import { scoreHand } from '@/game/scoreAdapter';
import { createDeck, sortHand } from '@/gameLogic';
import { makeInitialStateBase, type State } from '@/game/gameState';
import type { SolverResult } from '@/game/solver';

function verify(initial: State, result: SolverResult, count: number) {
  const frames = buildSolverReplay(initial,result);
  expect(frames.length).toBe(result.line.length+1);
  const final = frames[frames.length-1].state;
  expect(final.phase).toBe('win');
  expect(final.playerFuro.length).toBe(count);
  expect(final.playerFuro.every(f => ['pung','chii','daiminkan'].includes(f.type))).toBe(true);
  expect(result.bestScore).toBe(Math.max(...scoreHand(final)!.handInterpretations.map(h => h.totalWinnings)));
  for (const { state } of frames) {
    const owned = [...state.playerHand,...(state.playerDrawnTile ? [state.playerDrawnTile] : []),
      ...state.playerDiscards,...state.playerFuro.flatMap(f => f.tiles)];
    expect(new Set(owned.map(t => t.id)).size).toBe(owned.length);
    expect(state.playerFuro.length).toBeLessThanOrEqual(3);
    expect(state.isRiichi).toBe(false);
  }
  return frames;
}

describe('up to three open calls', () => {
  for (const mode of ['two','four'] as const) {
    it.each(['pon','chi'] as const)(`needs three %s calls in ${mode}-player mode`, kind => {
      const initial = makeThreeOpenHanemanTestState(kind,mode);
      const before = JSON.stringify(initial);
      const tiles = [...initial.playerHand,...initial.wall,...initial.wanpai,
        ...(initial.opponents ? initial.opponents.flatMap(o => o.hand) : initial.cpuHand)];
      expect(new Set(tiles.map(t => t.id)).size).toBe(tiles.length);
      const closed = searchWithAnkan(initial,findBestNoKanSolution(initial),8000,2);
      const two = searchWithOpenCalls(initial,closed,8000,2);
      expect(two?.bestScore ?? 0).toBeLessThan(12000);
      const updates: number[] = [];
      let stats: OpenSearchStats | undefined;
      const three = searchWithOpenCalls(initial,closed,8000,3,s => { stats = s; },r => updates.push(r?.bestScore ?? 0))!;
      expect(three.bestScore).toBe(12000);
      const frames = verify(initial,three,3);
      const calls = frames.filter(f => f.action?.type === 'call-naki');
      expect(calls.map(f => f.state.wallDrawnCount)).toEqual(kind === 'chi' && mode === 'four' ? [1,4,7] : [1,2,3]);
      if (kind === 'chi' && mode === 'four') expect(calls.every(f => f.state.lastDiscardWind === 'east')).toBe(true);
      expect(updates.every((v,i) => i === 0 || v >= updates[i-1])).toBe(true);
      expect(stats!.threeCallCandidates).toBeGreaterThan(0);
      expect(stats!.timeLimitReached).toBe(false);
      expect(JSON.stringify(initial)).toBe(before);
    });
  }
  it('keeps the closed result on a tie', () => {
    const initial = makeThreeOpenHanemanTestState();
    const baseline: SolverResult = { supported:true,complete:false,outcome:'win',bestScore:12000,line:[],
      stats:{statesVisited:0,cacheHits:0,prunedBranches:0,elapsedMs:0} };
    expect(searchWithOpenCalls(initial,baseline)).toBe(baseline);
  });
  it('retains the previous result when its time budget is exhausted', () => {
    const initial = makeThreeOpenHanemanTestState();
    const result = searchWithOpenCalls(initial,null)!;
    let stats: OpenSearchStats | undefined;
    expect(searchWithOpenCalls(initial,result,0,3,s => { stats = s; })).toBe(result);
    expect(stats!.timeLimitReached).toBe(true);
    expect(stats!.threeCallCandidates).toBe(0);
  });
  it('uses the own draw after the third call', () => {
    const initial = makeThreeOpenHanemanTestState();
    const wall = [...initial.wall];
    [wall[3],wall[6]] = [wall[6],wall[3]];
    const state = { ...initial,wall,fullWall:wall };
    const result = searchWithOpenCalls(state,null)!;
    const frames = verify(state,result,3);
    const final = frames[frames.length-1].state;
    expect(final.winType).toBe('tsumo');
    expect(final.wallDrawnCount).toBe(7);
  });
  it('does not chi the third meld from the wrong seat', () => {
    const initial = makeThreeOpenHanemanTestState('chi');
    const wall = [...initial.wall.slice(0,4),...initial.wall.slice(6)];
    expect(searchWithOpenCalls({ ...initial,wall,fullWall:wall },null)).toBeNull();
  });
  it('measures the three-call stage on a full wall with the production-sized budget', () => {
    const deck = createDeck();
    let seed = 20261016;
    for (let i = deck.length-1; i > 0; i--) {
      seed = (Math.imul(seed,1664525)+1013904223) >>> 0;
      const j = Math.floor(seed / 4294967296 * (i+1));
      [deck[i],deck[j]] = [deck[j],deck[i]];
    }
    const hand = sortHand(deck.splice(0,13));
    const opponents = deck.splice(0,39);
    const wanpai = deck.splice(0,14);
    const initial: State = { ...makeInitialStateBase(hand,opponents.slice(0,13),deck,wanpai,'south','east'),
      mode:'four',nextSeat:'east',roundWind:'east' };
    let stats: OpenSearchStats | undefined;
    const result = searchWithOpenCalls(initial,null,50000,3,s => { stats = s; });
    expect(stats!.threeCallCandidates).toBeGreaterThan(0);
    if (result) verify(initial,result,result.line.filter(a => a.type === 'call-naki').length);
    console.info('[three-open-call full wall]',stats,result?.bestScore);
  },60000);
});
