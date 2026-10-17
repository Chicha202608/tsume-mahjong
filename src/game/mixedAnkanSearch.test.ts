import { it, expect } from 'vitest';
import type { Tile } from '@/types';
import { createDeck, sortHand } from '@/gameLogic';
import { makeInitialStateBase } from '@/game/gameState';
import { searchWithOpenCalls, openHanUpperBound } from '@/game/openSearch';
import { buildSolverReplay } from '@/game/solverReplay';
import { scoreHand } from '@/game/scoreAdapter';

function fixture(beforePon: boolean, chained: boolean, mode: 'two' | 'four') {
  const deck = createDeck();
  const take = (suit: Tile['suit'], value: number) => {
    const i = deck.findIndex(t => t.suit === suit && t.value === value && !t.isRed);
    if (i < 0) throw new Error('Missing mixed-kan tile');
    return deck.splice(i,1)[0];
  };
  const hand = sortHand([... [1,1,4,4,4,8,8,8].map(v=>take('pin',v)),
    take('wind',3),take('wind',3),take('dragon',3),take('dragon',3),take('wind',4)]);
  const pon = take('dragon',3), fourth = take('pin',8), win = take('pin',1);
  const rinshan = chained ? take('pin',4) : take('wind',2);
  const nextRinshan = take('wind',1);
  const indicators = [take('dragon',2),take('dragon',2),take('dragon',2)];
  const filler = [2,3,6].slice(0,mode === 'four' ? 3 : 1).map(v=>take('sou',v));
  const wall = [...(beforePon ? [fourth,pon] : [pon,...filler,fourth]),win,
    ...[2,3,4,6,7].map(v=>take('man',v))];
  const wanpai = [rinshan,nextRinshan,...deck.splice(0,2),...indicators,...deck.splice(0,7)];
  return {...makeInitialStateBase(hand,deck.splice(0,13),wall,wanpai,'south','east'),
    mode,roundWind:'east' as const,phase:beforePon ? 'playerDraw' as const : 'cpuTurn' as const,
    nextSeat:beforePon ? 'south' as const : 'east' as const};
}

for (const mode of ['two','four'] as const) {
  it.each([false,true])(`finds ankan with pon (ankan first: %s) in ${mode} mode`, before => {
    const state = fixture(before,false,mode);
    const snapshot = JSON.stringify(state);
    const result = searchWithOpenCalls(state,null,10000)!;
    expect(result.bestScore).toBe(24000);
    const actions = result.line.filter(a=>a.type==='ankan' || a.type==='call-naki');
    expect(actions.map(a=>a.type)).toEqual(before ? ['ankan','call-naki'] : ['call-naki','ankan']);
    const frames = buildSolverReplay(state,result);
    expect(frames).toHaveLength(result.line.length+1);
    const final = frames[frames.length-1].state;
    expect(final.phase).toBe('win');
    expect(final.doraCount).toBe(2);
    expect(final.playerFuro.find(f=>f.type==='ankan')!.tiles).toHaveLength(4);
    expect(Math.max(...scoreHand(final)!.handInterpretations.map(h=>h.totalWinnings))).toBe(result.bestScore);
    for (const {state:s} of frames) {
      const owned = [...s.playerHand,...(s.playerDrawnTile ? [s.playerDrawnTile] : []),
        ...s.playerDiscards,...s.playerFuro.flatMap(f=>f.tiles)];
      expect(new Set(owned.map(t=>t.id)).size).toBe(owned.length);
    }
    expect(JSON.stringify(state)).toBe(snapshot);
  },15000);
}

it('chains ankan from the rinshan after a pon', () => {
  const state = fixture(false,true,'four');
  const result = searchWithOpenCalls(state,null,10000)!;
  const frames = buildSolverReplay(state,result);
  const kans = frames.filter(f=>f.action?.type==='ankan');
  expect(kans).toHaveLength(2);
  expect(kans[0].state.wallDrawnCount).toBe(kans[1].state.wallDrawnCount);
  expect(kans.map(f=>f.state.playerDrawnTile?.id)).toEqual(state.wanpai.slice(0,2).map(t=>t.id));
  expect(kans[1].state.wall).toEqual(state.wall.slice(5,-2));
  expect(result.bestScore).toBe(32000);
},15000);

it('includes concealed kans in the sanankou upper bound', () => {
  const state = fixture(false,false,'four');
  const counts = Array<number>(34).fill(0);
  counts[9] = 3; counts[12] = 3; counts[29] = 2;
  const tiles = state.playerHand.filter(t=>t.suit==='pin' && t.value===8);
  const meld = [...tiles,state.wall[4]];
  const base = {...state,doraCount:0};
  expect(openHanUpperBound({...base,playerFuro:[{type:'ankan',tiles:meld,calledTile:meld[0]}]},counts,meld,[])
    - openHanUpperBound(base,counts,meld,[])).toBe(2);
});

it('upgrades a pon using the rinshan from an ankan', () => {
  const state = fixture(false,false,'four');
  const owned = new Set([...state.playerHand,...state.cpuHand,...state.wall,...state.wanpai].map(t=>t.id));
  const fourthChun = createDeck().find(t=>t.suit==='dragon' && t.value===3 && !owned.has(t.id))!;
  expect(fourthChun).toBeDefined();
  state.wanpai[0] = fourthChun;
  const result = searchWithOpenCalls(state,null,10000)!;
  const frames = buildSolverReplay(state,result);
  const kans = frames.filter(f=>f.action?.type==='ankan' || f.action?.type==='kakan');
  expect(kans.map(f=>f.action!.type)).toEqual(['ankan','kakan']);
  expect(kans[0].state.wallDrawnCount).toBe(kans[1].state.wallDrawnCount);
  expect(frames[frames.length-1].state.phase).toBe('win');
  expect(result.bestScore).toBe(32000);
},15000);
