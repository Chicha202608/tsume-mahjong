import { it, expect } from 'vitest';
import { createDeck, sortHand } from '@/gameLogic';
import { makeInitialStateBase, type State } from '@/game/gameState';
import { searchWithNuki, searchWithOpenCalls, type OpenSearchStats } from '@/game/openSearch';
import { buildSolverReplay } from '@/game/solverReplay';
import { scoreHand } from '@/game/scoreAdapter';

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

it.each([true,false])('measures north-first and subsequent mixed search (short=%s)', short => {
  const state = deal(20261021, short);
  let after: OpenSearchStats | undefined, mixed: OpenSearchStats | undefined;
  let firstMs: number | null = null;
  const start = Date.now();
  const preferred = searchWithNuki(state,null,3000,s => { after = s; }, result => {
    if (result && firstMs === null) firstMs = Date.now() - start;
  });
  const final = searchWithOpenCalls(state,preferred,3000,4,s => { mixed = s; });
  for (const result of [preferred, final]) {
    if (!result) continue;
    const frames = buildSolverReplay(state,result);
    expect(frames).toHaveLength(result.line.length + 1);
    const last = frames[frames.length - 1].state;
    expect(last.phase).toBe('win');
    expect(scoreHand(last)!.handInterpretations[0].totalWinnings).toBe(result.bestScore);
  }
  console.log(JSON.stringify({short,wall:state.wall.length,preferredScore:preferred?.bestScore,finalScore:final?.bestScore,
    firstMs,after,mixed},null,2));
  expect(after!.callCandidates).toBe(1);
  if (short) {
    expect(final?.bestScore).toBe(18000);
    expect(after!.replayedLines + mixed!.replayedLines).toBeLessThan(129);
  }
},20000);
