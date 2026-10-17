import { it, expect } from 'vitest';
import type { Tile } from '@/types';
import type { SolverResult } from '@/game/solver';
import { createDeck, sortHand } from '@/gameLogic';
import { makeInitialStateBase } from '@/game/gameState';
import { searchWithOpenCalls } from '@/game/openSearch';
import { buildSolverReplay } from '@/game/solverReplay';
import { scoreHand } from '@/game/scoreAdapter';

function fixture(dora = true, dealer = false) {
  const deck = createDeck();
  const take = (suit: Tile['suit'], value: number) => {
    const i=deck.findIndex(t=>t.suit===suit && t.value===value && !t.isRed);
    if(i<0) throw new Error('Missing low-open fixture tile');
    return deck.splice(i,1)[0];
  };
  const hand=sortHand([take('dragon',1),take('dragon',1),
    ...[1,1,1,9,9,9].map(v=>take('man',v)),take('pin',2),take('pin',2),
    take('sou',5),take('sou',5),take('wind',4)]);
  const wall=[take('dragon',1),take('sou',5),take('pin',7),take('pin',8),take('sou',2)];
  const indicator=take('pin',dora ? 1 : 3);
  const wanpai=[...deck.splice(0,4),indicator,...deck.splice(0,9)];
  return {...makeInitialStateBase(hand,deck.splice(0,13),wall,wanpai,dealer ? 'east' : 'south',dealer ? 'north' : 'east'),
    mode:'four' as const,phase:'cpuTurn' as const,nextSeat:dealer ? 'north' as const : 'east' as const,roundWind:'east' as const};
}
const baseline=(score:number):SolverResult=>({supported:true,complete:false,outcome:'win',bestScore:score,line:[],
  stats:{statesVisited:0,cacheHits:0,prunedBranches:0,elapsedMs:0}});
function verify(state:ReturnType<typeof fixture>,result:SolverResult) {
  const frames=buildSolverReplay(state,result);
  expect(frames).toHaveLength(result.line.length+1);
  const final=frames[frames.length-1].state;
  expect(final.phase).toBe('win');
  expect(Math.max(...scoreHand(final)!.handInterpretations.map(h=>h.totalWinnings))).toBe(result.bestScore);
}
it.each([3200,6400])('improves a closed %i-point baseline to open mangan', score=>{
  const state=fixture();
  const result=searchWithOpenCalls(state,baseline(score),3000)!;
  expect(result.bestScore).toBe(8000);
  verify(state,result);
});
it('keeps a closed mangan on a tie',()=>{
  const closed=baseline(8000);
  expect(searchWithOpenCalls(fixture(),closed,3000)).toBe(closed);
});
it('keeps a closed sub-mangan score on a tie',()=>{
  const closed=baseline(6400);
  expect(searchWithOpenCalls(fixture(false),closed,3000)).toBe(closed);
});
it('accepts a three-han high-fu improvement below mangan',()=>{
  const state=fixture(false);
  const result=searchWithOpenCalls(state,baseline(3200),3000)!;
  expect(result.bestScore).toBe(6400);
  verify(state,result);
});
it('uses the dealer mangan threshold',()=>{
  const state=fixture(true,true);
  const result=searchWithOpenCalls(state,baseline(9600),3000)!;
  expect(result.bestScore).toBe(12000);
  verify(state,result);
  const closed=baseline(12000);
  expect(searchWithOpenCalls(state,closed,3000)).toBe(closed);
});
