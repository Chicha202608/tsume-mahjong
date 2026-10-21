import { it, expect } from 'vitest';
import { createDeck, sortHand } from '@/gameLogic';
import { makeInitialStateBase, type State } from '@/game/gameState';
import { searchWithNuki, searchWithOpenCalls } from '@/game/openSearch';
import { buildSolverReplay } from '@/game/solverReplay';
import { scoreHand } from '@/game/scoreAdapter';
import * as riichi from 'riichi-score';
import { vi } from 'vitest';
import { createSearchContext } from '@/game/searchContext';
import { findBestNoKanSolution } from '@/game/drawSolution';

vi.mock('riichi-score', async importOriginal => {
  const actual = await importOriginal<typeof import('riichi-score')>();
  return { ...actual, calculate:vi.fn(actual.calculate) };
});

function deal(seed: number, short: boolean): State {
  const deck = createDeck('three');
  const take = (suit: typeof deck[number]['suit'], value: number) => {
    const i = deck.findIndex(t => t.suit === suit && t.value === value && !t.isRed);
    if (i < 0) throw new Error('Missing tile');
    return deck.splice(i, 1)[0];
  };
  const hand = sortHand([...Array.from({length:9}, (_, i) => take('pin', i+1)),
    take('sou',2),take('sou',3),take('sou',5),take('wind',4)]);
  const first = take('sou',5), win = take('sou',1), north = take('wind',4);
  for (let i = deck.length - 1; i > 0; i--) {
    seed = (Math.imul(seed,1664525) + 1013904223) >>> 0;
    const j = Math.floor(seed / 4294967296 * (i+1));
    [deck[i],deck[j]] = [deck[j],deck[i]];
  }
  const opponents = deck.splice(0,26), wanpai = deck.splice(0,14);
  const wall = [first, ...(short ? deck.slice(0,7) : deck), win, north];
  return { ...makeInitialStateBase(hand, opponents.slice(0,13), wall, wanpai, 'east','south'),
    mode:'three',nextSeat:'east',phase:'playerDraw',roundWind:'east',playerNuki:[] };
}

it.each([true,false])('measures shared scoring and retained-north filtering (short=%s)', short => {
  const initial = deal(20261021,short);
  const calculate = vi.mocked(riichi.calculate);
  calculate.mockClear();
  const start = Date.now();
  const context = createSearchContext(Date.now()+10000);
  const preferred = searchWithNuki(initial,null,1000,undefined,undefined,context);
  const stats = { targets:0,prunedTargets:0,replayedOpportunities:0 };
  const closed = findBestNoKanSolution(initial,{context,minimumScore:preferred?.bestScore ?? -1,stats});
  const baseline = (closed?.bestScore ?? -1) > (preferred?.bestScore ?? -1) ? closed : preferred;
  const final = searchWithOpenCalls(initial,baseline,1000,4,undefined,undefined,'all',context)!;
  const elapsedMs = Date.now()-start;
  const calculations = calculate.mock.calls.length;
  expect(final?.outcome).toBe('win');
  const frames = buildSolverReplay(initial,final);
  expect(frames).toHaveLength(final.line.length+1);
  expect(scoreHand(frames[frames.length-1].state)!.handInterpretations[0].totalWinnings).toBe(final.bestScore);
  console.log(JSON.stringify({short,score:final.bestScore,elapsedMs,calculations,closed:stats,cache:context.stats}));
  if (short) {
    expect(final.bestScore).toBe(18000);
    expect(calculations).toBeLessThan(74); // Recorded uncached baseline: see SANMA_REUSE_RESULTS.md.
  }
},20000);

