import { describe, expect, it } from 'vitest';
import { searchBestWin } from '@/game/solver';
import { evaluateCandidateWins } from '@/game/candidateReplay';
import { makeInitialStateBase } from '@/game/gameState';
import type { Tile } from '@/types';

function tile(suit: Tile['suit'], value: number, id: string): Tile {
  return { suit, value, id };
}
const suits: Array<Tile['suit']> = ['man','pin','sou','wind','dragon'];
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state,1664525) + 1013904223) >>> 0) / 4294967296);
}
function shuffled<T>(a: T[], rng: () => number): T[] {
  const result = [...a];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i+1));
    [result[i],result[j]] = [result[j],result[i]];
  }
  return result;
}
function generate(seed: number, length: number, winning: boolean) {
  const rng = random(seed);
  const all: Tile[] = [];
  for (const suit of suits) for (let v = 1; v <= (suit === 'wind' ? 4 : suit === 'dragon' ? 3 : 9); v++) {
    for (let copy = 0; copy < 4; copy++) all.push(tile(suit,v,`${suit}-${v}-${copy}`));
  }
  const chosen: Tile[] = [];
  const take = (suit: Tile['suit'], value: number) => {
    const i = all.findIndex(x=>x.suit===suit && x.value===value);
    if (i < 0) throw new Error('invalid synthetic hand');
    chosen.push(...all.splice(i,1));
  };
  if (winning) {
    // Four complete groups and one pair. Remove the winning tile and
    // possibly a second needed tile; relocate those to the wall.
    for (const suit of ['man','pin','sou'] as const) {
      const start = 1 + Math.floor(rng()*7);
      for (let i=0;i<3;i++) take(suit,start+i);
    }
    const start = 1 + Math.floor(rng()*7);
    for (let i=0;i<3;i++) take('man',start+i);
    take('wind',1);take('wind',1);
    const win = chosen.splice(Math.floor(rng()*chosen.length),1)[0];
    const displaced = rng()<0.5 ? chosen.splice(Math.floor(rng()*chosen.length),1)[0] : null;
    const hand = shuffled(chosen.concat(shuffled(all,rng).slice(0,displaced?1:0)),rng);
    if (displaced) all.splice(all.findIndex(x=>x.id===hand.find(h=>!chosen.includes(h))?.id),1);
    // Place winning tile on later player draw or CPU discard; make a full wall.
    const winIndex = displaced ? (length >= 4 ? 3 : 2) : Math.floor(rng()*length);
    const pool = shuffled(all.filter(x=>x.id!==win.id),rng);
    const wall = pool.slice(0,length);
    if (displaced) wall[0] = displaced;
    wall[winIndex] = win;
    return { hand, wall };
  }
  const deck = shuffled(all,rng);
  return {hand:deck.slice(0,13),wall:deck.slice(13,13+length)};
}

describe('seeded old/new short-wall comparisons', () => {
  for (const winning of [true,false]) {
    for (let seed = 1; seed <= 24; seed++) {
      const wallLength = 4 + seed % 5;
      it(`seed ${seed}, ${winning ? 'constructed win' : 'random'}, wall ${wallLength}`, () => {
        const {hand,wall}=generate(seed,wallLength,winning);
        const state = makeInitialStateBase(hand,[],wall,[]);
        const old=searchBestWin(state,{maxStates:1_000_000,maxDurationMs:15_000});
        const newWins=evaluateCandidateWins(state).filter(x=>x.score!==null);
        const actual=newWins.length?Math.max(...newWins.map(x=>x.score!)):null;
        const debug=JSON.stringify({
          seed,winning,wallLength,hand:hand.map(x=>x.id),wall:wall.map(x=>x.id),
          oldScore:old.bestScore,oldComplete:old.complete,newScore:actual,
          oldLine:old.line.map(x=>x.type),newTop:newWins[0]?.opportunity.wallIndex,
        });
        expect(old.complete,debug).toBe(true);
        expect(actual,debug).toBe(old.bestScore);
      });
    }
  }
});
