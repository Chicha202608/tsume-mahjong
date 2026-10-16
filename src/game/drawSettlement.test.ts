import { describe, expect, it } from 'vitest';
import type { Tile } from '@/types';
import { makeInitialStateBase, type GameMode, type State } from '@/game/gameState';
import { drawSettlement } from '@/game/drawSettlement';
import { findDrawSolution, findBestNoKanSolution } from '@/game/drawSolution';
import { findCandidateSolution } from '@/game/candidateSolution';
import { buildSolverReplay } from '@/game/solverReplay';

let serial=0;
const tile=(suit:Tile['suit'], value:number):Tile=>({suit,value,id:`draw-${serial++}`});
const hand=()=>[...Array.from({length:3},()=>tile('dragon',1)),
  ...[1,2,3].map(v=>tile('man',v)), ...[1,2,3,5,5].map(v=>tile('pin',v)),
  tile('sou',7),tile('sou',8)];
function fixture(mode:GameMode):State {
  return {...makeInitialStateBase(hand(),[],[tile('sou',9)],[],'south','west'),
    mode, phase:'cpuTurn',nextSeat:'west',roundWind:'east'};
}

describe.each(['two','four'] as const)('draw settlement (%s players)',mode=>{
  it('recognizes seven-pairs and both kokushi waits',()=>{
    const initial=fixture(mode);
    const seven=[1,1,3,3,5,5,7,7,9,9].map(v=>tile('man',v));
    seven.push(tile('wind',1),tile('wind',1),tile('dragon',1));
    const orphans=[tile('man',1),tile('man',9),tile('pin',1),tile('pin',9),tile('sou',1),tile('sou',9),
      ...[1,2,3,4].map(v=>tile('wind',v)), ...[1,2,3].map(v=>tile('dragon',v))];
    for(const playerHand of [seven,orphans,[...orphans.slice(0,12),tile('man',1)]]){
      expect(drawSettlement({...initial,phase:'exhausted',wall:[],playerHand}))
        .toEqual({tenpai:true,score:3000});
    }
  });
  it('pays 3000 for tenpai, including furiten, and 0 for noten',()=>{
    const initial=fixture(mode);
    expect(drawSettlement(initial)).toBeNull();
    expect(drawSettlement({...initial,phase:'exhausted',wall:[],playerDiscards:[tile('sou',9)]}))
      .toEqual({tenpai:true,score:3000});
    const noten=[...initial.playerHand]; noten[0]=tile('wind',2);
    expect(drawSettlement({...initial,playerHand:noten,phase:'exhausted',wall:[]}))
      .toEqual({tenpai:false,score:0});
  });
  it('pays the same amount with a concealed kan or an open meld',()=>{
    const initial=fixture(mode);
    for(const type of ['ankan','pung'] as const){
      const tiles=initial.playerHand.slice(0,3);
      if(type==='ankan') tiles.push(tile('dragon',1));
      expect(drawSettlement({...initial,phase:'exhausted',wall:[],playerHand:initial.playerHand.slice(3),
        playerFuro:[{type,tiles,calledTile:tiles[0]}]})).toEqual({tenpai:true,score:3000});
    }
  });
  it('prefers a 3000-point tenpai draw over a cheaper legal ron and replays the declined ron',()=>{
    const initial=fixture(mode);
    const win=findCandidateSolution(initial)!;
    expect(win.outcome).toBe('win');
    expect(win.bestScore).toBeLessThan(3000);
    const result=findBestNoKanSolution(initial)!;
    expect(result.outcome).toBe('tenpai'); expect(result.bestScore).toBe(3000);
    expect(result.line.some(a=>a.type==='pass-naki')).toBe(true);
    const frames=buildSolverReplay(initial,result);
    expect(frames).toHaveLength(result.line.length+1);
    expect(drawSettlement(frames[frames.length-1].state)?.score).toBe(3000);
  });
  it('retains a winning line worth more than 3000',()=>{
    const initial={...fixture(mode),isRiichi:true,isIppatsu:true};
    const result=findBestNoKanSolution(initial)!;
    expect(result.outcome).toBe('win');expect(result.bestScore).toBeGreaterThan(3000);
  });
  it('can reach tenpai on the very last own draw without any winning opportunity',()=>{
    const initial=fixture(mode);
    initial.playerHand[12]=tile('wind',4);
    initial.wall=[tile('sou',8)]; initial.fullWall=[...initial.wall];
    initial.phase='playerDraw';initial.nextSeat=initial.playerWind;
    expect(findCandidateSolution(initial)).toBeNull();
    const result=findDrawSolution(initial)!;
    expect(result.outcome).toBe('tenpai');
    expect(result.bestScore).toBe(3000);
    const frames=buildSolverReplay(initial,result);
    expect(drawSettlement(frames[frames.length-1].state)?.tenpai).toBe(true);
  });
});
