import { describe, expect, it } from 'vitest';
import { searchBestWin } from '@/game/solver';
import { evaluateCandidateWins } from '@/game/candidateReplay';
import { enumerateTenpaiCandidates } from '@/game/tenpaiCandidates';
import { makeInitialStateBase } from '@/game/gameState';
import type { Tile } from '@/types';
const t=(id:string,suit:Tile['suit'],value:number,isRed=false):Tile=>({id,suit,value,...(isRed?{isRed:true}:{})});
const hand:Tile[]=[
  t('m1','man',1),t('m2','man',2),t('m3','man',3),
  t('p1','pin',1),t('p2','pin',2),t('p3','pin',3),
  t('s1','sou',1),t('s2','sou',2),t('s3','sou',3),
  t('s7','sou',7),t('s9','sou',9),
  t('e1','wind',1),t('e2','wind',1),
];
const cases:Array<{name:string; hand:Tile[];wall:Tile[];river?:Tile[];minCandidates?:number}>= [
 {name:'river furiten on a multiwait',hand,wall:[t('p9','pin',9),t('s8','sou',8),t('m9','man',9)],river:[t('s8past','sou',8)]},
 {name:'red five in original hand',hand:hand.map(x=>x.id==='m2'?t('m2r','man',2,true):x),wall:[t('p9','pin',9),t('s8','sou',8),t('m9','man',9)]},
 {name:'red five as own draw needed for a hand',hand:[...hand.slice(0,9),t('s7x','sou',7),t('d1','dragon',1),...hand.slice(11)],wall:[t('s5red','sou',5,true),t('d2','dragon',2),t('s8','sou',8),t('m9','man',9)]},
 {name:'multiple tenpai targets',hand,wall:[t('s6','sou',6),t('p7','pin',7),t('s8','sou',8),t('m5','man',5),t('p9','pin',9)],minCandidates:2},
 {name:'own-discard furiten possibility',hand,wall:[t('s8a','sou',8),t('p9','pin',9),t('s8b','sou',8),t('s8c','sou',8),t('m9','man',9)]},
];
describe('focused old/new score agreement',()=>{
 for(const c of cases) it(c.name,()=>{
   const state={...makeInitialStateBase(c.hand,[],c.wall,[]),
     playerDiscards:c.river??[], roundWind:'east' as const,playerWind:'south' as const};
   const candidates=enumerateTenpaiCandidates(state);
   if(c.minCandidates) expect(candidates.length).toBeGreaterThanOrEqual(c.minCandidates);
   const old=searchBestWin(state,{maxStates:1_000_000,maxDurationMs:15_000});
   const newResults=evaluateCandidateWins(state).filter(x=>x.score!==null);
   const newBest=newResults.length?Math.max(...newResults.map(x=>x.score!)):null;
   const detail=JSON.stringify({case:c.name,oldComplete:old.complete,oldScore:old.bestScore,newBest,oldLine:old.line.map(x=>x.type),candidateCount:candidates.length,wall:c.wall.map(x=>x.id)});
   expect(old.complete,detail).toBe(true);
   expect(newBest,detail).toBe(old.bestScore);
 });
});
