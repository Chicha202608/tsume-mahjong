import { it, expect, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { makeInitialState } from '@/game/gameState';
import { findBestNoKanSolution } from '@/game/drawSolution';
import { searchWithAnkan, lastAnkanTimedOut } from './ankanMeasured';
import { searchWithOpenCalls, type OpenSearchStats } from '@/game/openSearch';
import { buildSolverReplay } from '@/game/solverReplay';
import { scoreHand } from '@/game/scoreAdapter';

const rows: unknown[] = [];
for (const mode of ['two','four'] as const) for (let sample=0;sample<100;sample++) {
  it(`${mode} sample ${sample}`,()=>{
    let seed=(20261017+sample*7919)>>>0;
    const random=vi.spyOn(Math,'random').mockImplementation(()=>{
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      return seed/4294967296;
    });
    const state=makeInitialState(mode);
    random.mockRestore();
    const started=Date.now(),deadline=started+60000;
    const remaining=()=>Math.max(0,deadline-Date.now());
    const noKan=findBestNoKanSolution(state);
    const closed=searchWithAnkan(state,noKan,Math.min(8000,remaining()),2);
    const ankanTimedOut=lastAnkanTimedOut;
    let stats:OpenSearchStats|undefined;
    const result=searchWithOpenCalls(state,closed,remaining(),4,s=>{stats=s;});
    let yaku:string[]=[];
    if(result?.outcome==='win') {
      const frames=buildSolverReplay(state,result);
      expect(frames).toHaveLength(result.line.length+1);
      const end=frames[frames.length-1].state;
      expect(end.phase).toBe('win');
      const hands=scoreHand(end)!.handInterpretations;
      expect(Math.max(...hands.map(h=>h.totalWinnings))).toBe(result.bestScore);
      yaku=[...new Set(hands.filter(h=>h.totalWinnings===result.bestScore).flatMap(h=>h.yaku.map(y=>y.name)))];
    }
    rows.push({mode,sample,seed:20261017+sample*7919,playerWind:state.playerWind,roundWind:state.roundWind,
      score:result?.bestScore,outcome:result?.outcome,chiitoitsu:yaku.includes('chiitoitsu'),yaku,
      elapsedMs:Date.now()-started,ankanTimedOut,openTimedOut:stats?.timeLimitReached??false});
    writeFileSync('experiments/chiitoitsu-rate-results.json',JSON.stringify({
      definition:'Selected AI best-score line contains chiitoitsu in a top-scoring interpretation; not all tied final shapes',
      totalBudgetMs:60000,rows},null,2));
  },90000);
}
