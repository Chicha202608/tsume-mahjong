import { it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { createDeck, sortHand } from '@/gameLogic';
import { makeInitialStateBase } from '@/game/gameState';
import { findBestNoKanSolution } from '@/game/drawSolution';
import { searchWithAnkan } from '@/game/ankanSearch';
import { buildSolverReplay } from '@/game/solverReplay';
import { scoreHand } from '@/game/scoreAdapter';
import { searchWithOpenCalls, type OpenSearchStats } from './openSearchFour';

const rows: unknown[] = [];
for (let seedValue = 20261016; seedValue < 20261116; seedValue++) {
  it(`four-call full-wall seed ${seedValue}`, () => {
    const deck = createDeck();
    let seed = seedValue;
    for (let i = deck.length - 1; i > 0; i--) {
      seed = (Math.imul(seed,1664525)+1013904223) >>> 0;
      const j = Math.floor(seed / 4294967296 * (i+1));
      [deck[i],deck[j]] = [deck[j],deck[i]];
    }
    const hand = sortHand(deck.splice(0,13));
    const opponents = deck.splice(0,39);
    const wanpai = deck.splice(0,14);
    const state = { ...makeInitialStateBase(hand,opponents.slice(0,13),deck,wanpai,'south','east'),
      mode:'four' as const,nextSeat:'east' as const,roundWind:'east' as const };
    const begin = Date.now();
    const closed = searchWithAnkan(state,findBestNoKanSolution(state),8000,2);
    const closedMs = Date.now()-begin;
    let stats: OpenSearchStats | undefined;
    const result = searchWithOpenCalls(state,closed,180000,4,s => { stats=s; });
    const totalMs = Date.now()-begin;
    const row = { seed:seedValue,closedMs,totalMs,closedScore:closed?.bestScore,
      bestScore:result?.bestScore,...stats };
    rows.push(row);
    writeFileSync('experiments/open-calls-results.json',JSON.stringify({
      cpu:cpus()[0]?.model,openBudgetMs:180000,mode:'four',wallTiles:70,rows },null,2));
    console.info('[FOUR_CALL_BENCH]',JSON.stringify(row));
    expect(stats).toBeDefined();
    if (result?.line.length) {
      const frames = buildSolverReplay(state,result);
      expect(frames.length).toBe(result.line.length+1);
      const final = frames[frames.length-1].state;
      if (result.outcome === 'win') {
        expect(final.phase).toBe('win');
        expect(Math.max(...scoreHand(final)!.handInterpretations.map(h => h.totalWinnings))).toBe(result.bestScore);
      }
    }
  },240000);
}
