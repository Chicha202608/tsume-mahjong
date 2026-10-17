import { it, expect } from 'vitest';
import { createDeck, sortHand } from '@/gameLogic';
import type { Tile } from '@/types';
import { makeInitialStateBase } from '@/game/gameState';
import { buildSolverReplay } from '@/game/solverReplay';
import { searchWithOpenCalls } from './openSearchFour';

it('actually finds a legal four-call win', () => {
  const deck = createDeck();
  const take = (suit: Tile['suit'], value: number) => {
    const index = deck.findIndex(t => t.suit === suit && t.value === value && !t.isRed);
    if (index < 0) throw new Error('Missing fixture tile');
    return deck.splice(index,1)[0];
  };
  const pairs = [1,2,3].flatMap(v => [take('dragon',v),take('dragon',v)]);
  const hand = sortHand([...pairs,take('wind',1),take('wind',1),take('wind',3),
    ...[2,4,6,8].map(v => take('man',v))]);
  const wall = [...[1,2,3].map(v => take('dragon',v)),take('wind',1),take('wind',3),
    take('sou',2),take('sou',3),take('sou',4)];
  const state = {...makeInitialStateBase(hand,deck.splice(0,13),wall,deck.splice(0,14),'south','east'),
    mode:'four' as const,nextSeat:'east' as const,roundWind:'east' as const};
  expect(searchWithOpenCalls(state,null,5000,3)).toBeNull();
  const result = searchWithOpenCalls(state,null,5000,4)!;
  expect(result.bestScore).toBe(64000); // Daisangen plus tsuuiisou.
  const frames = buildSolverReplay(state,result);
  expect(frames).toHaveLength(result.line.length+1);
  const final = frames[frames.length-1].state;
  expect(final.phase).toBe('win');
  expect(final.playerFuro).toHaveLength(4);
},15000);
