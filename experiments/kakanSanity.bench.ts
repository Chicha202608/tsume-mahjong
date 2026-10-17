import { it, expect } from 'vitest';
import { createDeck, sortHand } from '@/gameLogic';
import type { Tile } from '@/types';
import { makeInitialStateBase } from '@/game/gameState';
import { buildSolverReplay } from '@/game/solverReplay';
import { scoreHand } from '@/game/scoreAdapter';
import { searchWithOpenCalls, type OpenSearchStats } from './openSearchKakan';

it('replays four pon followed by four upgrades (eight operations)', () => {
  const deck = createDeck();
  const take = (suit: Tile['suit'], value: number) => {
    const i = deck.findIndex(t => t.suit === suit && t.value === value && !t.isRed);
    if(i<0) throw new Error('missing tile');
    return deck.splice(i,1)[0];
  };
  const faces: [Tile['suit'],number][] = [['pin',1],['pin',4],['pin',8],['dragon',3]];
  const pairs = faces.flatMap(([s,v]) => [take(s,v),take(s,v)]);
  const pon = faces.map(([s,v]) => take(s,v));
  const upgrades = faces.map(([s,v]) => take(s,v));
  const hand = sortHand([...pairs,take('wind',3),...[2,4,6,8].map(v=>take('sou',v))]);
  const win = take('wind',3);
  const rinshan = [2,4,6,8].map(v=>take('man',v));
  const indicators = deck.splice(0,10);
  const fillers = deck.splice(0,12);
  const wall = pon.flatMap((t,i) => [t,...fillers.slice(i*3,i*3+3),upgrades[i]]);
  wall.push(win,...deck.splice(0,5));
  const state = {...makeInitialStateBase(hand,deck.splice(0,13),wall,[...rinshan,...indicators],'south','east'),
    mode:'four' as const,nextSeat:'east' as const,roundWind:'east' as const};
  let stats: OpenSearchStats | undefined;
  const result = searchWithOpenCalls(state,null,30000,4,s=>{stats=s;})!;
  expect(stats!.maxOperations).toBe(8);
  expect(stats!.plansByOperations[8]).toBeGreaterThan(0);
  const frames = buildSolverReplay(state,result);
  expect(frames).toHaveLength(result.line.length+1);
  const final = frames[frames.length-1].state;
  expect(final.phase).toBe('win');
  expect(final.playerFuro.map(f=>f.type)).toEqual(['kakan','kakan','kakan','kakan']);
  expect(result.line.filter(a=>a.type==='call-naki')).toHaveLength(4);
  expect(result.line.filter(a=>a.type==='ankan' && a.option.type==='kakan')).toHaveLength(4);
  expect(final.doraCount).toBe(5);
  expect(result.bestScore).toBe(Math.max(...scoreHand(final)!.handInterpretations.map(h=>h.totalWinnings)));
  console.info('[EIGHT_OPERATIONS]',stats);
},40000);
