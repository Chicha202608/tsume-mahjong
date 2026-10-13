import { describe, expect, it } from 'vitest';
import { makeInitialStateBase } from '@/game/gameState';
import { enumerateTenpaiCandidates, findCandidateWinOpportunities } from '@/game/tenpaiCandidates';
import { evaluateCandidateWins, isTargetFuriten } from '@/game/candidateReplay';
import { createDeck } from '@/gameLogic';
import type { Tile } from '@/types';
const tile=(id:string,suit:Tile['suit'],value:number):Tile=>({id,suit,value});
describe('order-independent river calculation',()=>{
 const hand=[
 tile('m1','man',1),tile('m2','man',2),tile('m3','man',3),
 tile('p1','pin',1),tile('p2','pin',2),tile('p3','pin',3),
 tile('s1','sou',1),tile('s2','sou',2),tile('s3','sou',3),
 tile('s7','sou',7),tile('s9','sou',9),
 tile('e1','wind',1),tile('e2','wind',1)];
 it('detects past-river furiten without reconstructing any discard sequence',()=>{
   const state={...makeInitialStateBase(hand,[],[tile('unused','dragon',1),tile('ron','sou',8)],[]),
     playerDiscards:[tile('past','sou',8)]};
   const opportunities=findCandidateWinOpportunities(state,enumerateTenpaiCandidates(state));
   const ron=opportunities.find(o=>o.type==='ron'&&o.wallIndex===1);
   expect(ron).toBeDefined();
   expect(isTargetFuriten(state,ron!.candidate.counts,ron!.candidate.waits,1)).toBe(true);
 });
 it('calculates a matching furiten result directly from the tile multiset',()=>{
   const state=makeInitialStateBase(hand,[],[tile('unused','dragon',1),tile('ron','sou',8)],[]);
   const ron=findCandidateWinOpportunities(state,enumerateTenpaiCandidates(state))
     .find(o=>o.type==='ron'&&o.wallIndex===1);
   expect(ron).toBeDefined();
   expect(isTargetFuriten(state,ron!.candidate.counts,ron!.candidate.waits,1)).toBe(false);
 });
});
describe('36-wall candidate benchmark (non-DP)',()=>{
 it('reports candidate count and run time without claiming an optimum',()=>{
   const deck=createDeck();
   const take=(suit:Tile['suit'],value:number):Tile=>{
     const i=deck.findIndex(x=>x.suit===suit&&x.value===value);
     if(i<0)throw new Error('tile missing');
     return deck.splice(i,1)[0];
   };
   const hand=[
     take('man',1),take('man',2),take('man',3),
     take('man',4),take('man',5),take('man',6),
     take('pin',1),take('pin',2),take('pin',3),
     take('sou',7),take('sou',9),take('wind',3),take('wind',3)];
   // Shuffle the remaining deck reproducibly; createDeck() itself is ordered.\n   let seed=20261014;\n   const rng=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);\n   for(let i=deck.length-1;i>0;i--){\n     const j=Math.floor(rng()*(i+1));\n     [deck[i],deck[j]]=[deck[j],deck[i]];\n   }\n   const cpu=deck.splice(0,13);
   const dead=deck.splice(0,14);
   const wall=deck.splice(0,36);
   const state={...makeInitialStateBase(hand,cpu,wall,dead),
     roundWind:'east' as const,playerWind:'south' as const};
   const start=Date.now();
   const candidates=enumerateTenpaiCandidates(state);
   const generatedMs=Date.now()-start;
   const evaluations=evaluateCandidateWins(state);
   const totalMs=Date.now()-start;
   const singleWait=candidates.filter(c=>c.waits.length===1).length;\n   const immediatelyAvailable=candidates.filter(c=>c.earliestPlayerDraw===0).length;\n   const withWinOpportunity=new Set(evaluations.map(e=>e.opportunity.candidate.counts.join(','))).size;\n   console.info('[candidate full-wall benchmark]',{
     count:candidates.length,singleWait,immediatelyAvailable,withWinOpportunity,\n     opportunities:evaluations.length,generatedMs,totalMs,
     bestScore:evaluations.find(r=>r.score!==null)?.score??null,
   });
   expect(candidates.length).toBeGreaterThan(0);
   expect(totalMs).toBeGreaterThanOrEqual(0);
 });
});
