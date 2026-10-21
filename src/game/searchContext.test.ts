import { describe, expect, it, vi } from 'vitest';
import type { Tile } from '@/types';
import { makeInitialStateBase, type State } from '@/game/gameState';
import { createSearchContext, analyzeSearchHand } from '@/game/searchContext';
import { findBestNoKanSolution, findDrawSolution } from '@/game/drawSolution';
import { evaluateCandidateWins } from '@/game/candidateReplay';
import { findCandidateSolution } from '@/game/candidateSolution';
import { searchWithAnkan } from '@/game/ankanSearch';
import { makeTwoAnkanTestState } from '@/game/testScenarios';
import { buildSolverReplay } from '@/game/solverReplay';
import { scoreHand } from '@/game/scoreAdapter';

let serial = 0;
const tile = (suit: Tile['suit'], value: number): Tile => ({suit,value,id:`search-context-${serial++}`});
const tiles = (suit: Tile['suit'], values: number[]) => values.map(v => tile(suit,v));
function fixture(): State {
  const hand = [...tiles('pin',[1,2,3,4,5,6]),...tiles('sou',[2,3,5,5,6,7,8])];
  return { ...makeInitialStateBase(hand,[],[tile('sou',1),tile('wind',1),tile('wind',2)],[],'east','south'),
    mode:'three',roundWind:'east',nextSeat:'east',phase:'playerDraw',playerNuki:[] };
}
const won = (state: State): State => ({...state,phase:'win',winType:'tsumo',winTile:state.wall[0],playerDrawnTile:state.wall[0]});

describe('one-deal scoring reuse', () => {
  it('reuses equal scoring inputs across stages and physical IDs', () => {
    const context = createSearchContext(Infinity);
    const initial = won(fixture());
    const first = analyzeSearchHand(initial,context)!;
    const renamed = {...initial,playerHand:initial.playerHand.map(t => ({...t,id:`other-${t.id}`})).reverse()};
    expect(analyzeSearchHand(renamed,context)).toBe(first);
    expect(context.stats).toMatchObject({scoreRequests:2,scoreComputations:1,scoreCacheHits:1});
  });

  it('distinguishes north bonuses, mode and situational yaku', () => {
    const context = createSearchContext(Infinity);
    const initial = won(fixture());
    const ordinary = analyzeSearchHand(initial,context)!;
    const extracted = analyzeSearchHand({...initial,playerNuki:[tile('wind',4)]},context)!;
    const four = analyzeSearchHand({...initial,mode:'four'},context)!;
    const riichi = analyzeSearchHand({...initial,isRiichi:true,isIppatsu:true},context)!;
    expect(extracted.handInterpretations[0].han).toBe(ordinary.handInterpretations[0].han + 1);
    expect(four.handInterpretations[0].totalWinnings).toBeGreaterThan(ordinary.handInterpretations[0].totalWinnings);
    expect(riichi.handInterpretations[0].han).toBe(ordinary.handInterpretations[0].han + 2);
    expect(context.stats.scoreComputations).toBe(4);
    expect(context.stats.baseCacheHits).toBe(2); // north count and mode reuse the same yaku analysis.
    expect(ordinary.handInterpretations[0].nukiDora).toBe(0);
    expect(analyzeSearchHand(initial,context)).toBe(ordinary);
  });

  it('filters retained-north answers below the incumbent while reusing their scores', () => {
    const initial = fixture();
    const context = createSearchContext(Infinity);
    const stats = {targets:0,prunedTargets:0,replayedOpportunities:0};
    expect(evaluateCandidateWins(initial,{context,minimumScore:48000,stats})).toHaveLength(0);
    expect(stats.targets).toBeGreaterThan(0);
    expect(stats.prunedTargets).toBe(stats.targets);
    const computations = context.stats.scoreComputations;
    evaluateCandidateWins(initial,{context,minimumScore:48000});
    expect(context.stats.scoreComputations).toBe(computations);
    expect(context.stats.scoreCacheHits).toBeGreaterThan(0);
  });

  it('still reconstructs a stronger kokushi retaining north', () => {
    const initial = fixture();
    initial.playerHand = [...tiles('man',[1,9]),...tiles('pin',[1,9]),...tiles('sou',[1,9]),
      ...tiles('wind',[1,2,3,4]),...tiles('dragon',[1,2,3])];
    initial.wall = [tile('man',1),tile('pin',5)]; initial.fullWall = [...initial.wall];
    const result = findBestNoKanSolution(initial,{context:createSearchContext(Infinity),minimumScore:16000})!;
    expect(result.bestScore).toBeGreaterThan(16000);
    const frames = buildSolverReplay(initial,result);
    expect(frames).toHaveLength(result.line.length + 1);
    expect(scoreHand(frames[frames.length - 1].state)!.handInterpretations[0].totalWinnings).toBe(result.bestScore);
  });
});

describe('cooperative search deadline', () => {
  it('does no candidate or draw work after expiry', () => {
    const initial = fixture();
    const context = createSearchContext(0);
    expect(findCandidateSolution(initial,{context})).toBeNull();
    expect(findDrawSolution(initial,context)).toBeNull();
    expect(findBestNoKanSolution(initial,{context})).toBeNull();
    expect(context.stats.scoreComputations).toBe(0);
  });

  it('interrupts concealed-kan candidate enumeration at the shared deadline', () => {
    const initial = makeTwoAnkanTestState();
    let now = 0;
    const clock = vi.spyOn(Date,'now').mockImplementation(() => ++now);
    try {
      const context = createSearchContext(12);
      searchWithAnkan(initial,null,10000,2,undefined,context);
      expect(now).toBeLessThan(100);
    } finally { clock.mockRestore(); }
  });
});
