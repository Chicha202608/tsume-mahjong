import { it, expect } from 'vitest';
import { makeFourPonKakanTestState } from '@/game/testScenarios';
import { buildSolverReplay } from '@/game/solverReplay';
import { scoreHand } from '@/game/scoreAdapter';
import { searchWithOpenCalls, type OpenSearchStats } from '@/game/openSearch';

it.each(['two','four'] as const)('finds and replays eight operations in %s-player mode', mode => {
  const state = makeFourPonKakanTestState(mode);
  const original = JSON.stringify(state);
  let stats: OpenSearchStats | undefined;
  const updates: number[] = [];
  const result = searchWithOpenCalls(state,null,50000,4,s=>{stats=s;},r=>updates.push(r?.bestScore ?? 0))!;
  expect(stats!.maxOperations).toBe(8);
  expect(stats!.timeLimitReached).toBe(false);
  expect(updates.every((score,i)=>i===0 || score>=updates[i-1])).toBe(true);
  const frames = buildSolverReplay(state,result);
  expect(frames).toHaveLength(result.line.length+1);
  const final = frames[frames.length-1].state;
  expect(final.phase).toBe('win');
  expect(final.playerFuro.map(f=>f.type)).toEqual(['kakan','kakan','kakan','kakan']);
  expect(result.line.filter(a=>a.type==='call-naki')).toHaveLength(4);
  expect(result.line.filter(a=>a.type==='kakan')).toHaveLength(4);
  expect(final.doraCount).toBe(5);
  const kans = frames.filter(f=>f.action?.type==='kakan');
  expect(kans.map(f=>f.state.playerDrawnTile?.id)).toEqual(state.wanpai.slice(0,4).map(t=>t.id));
  for (const {state: frame} of frames) {
    const owned = [...frame.playerHand,...(frame.playerDrawnTile ? [frame.playerDrawnTile] : []),
      ...frame.playerDiscards,...frame.playerFuro.flatMap(f=>f.tiles)];
    expect(new Set(owned.map(t=>t.id)).size).toBe(owned.length);
  }
  expect(result.bestScore).toBe(32000);
  expect(result.bestScore).toBe(Math.max(...scoreHand(final)!.handInterpretations.map(h=>h.totalWinnings)));
  expect(JSON.stringify(state)).toBe(original);
},60000);

it('preserves an existing answer at the deadline', () => {
  const state = makeFourPonKakanTestState();
  let stats: OpenSearchStats | undefined;
  expect(searchWithOpenCalls(state,null,0,4,s=>{stats=s;})).toBeNull();
  expect(stats!.timeLimitReached).toBe(true);
  expect(stats!.callCandidates).toBe(0);
});
