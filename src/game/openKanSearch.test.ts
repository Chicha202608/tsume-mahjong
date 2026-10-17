import { describe, expect, it } from 'vitest';
import type { Tile } from '@/types';
import { createDeck, sortHand } from '@/gameLogic';
import { makeInitialStateBase } from '@/game/gameState';
import { searchWithOpenCalls, openHanUpperBound } from '@/game/openSearch';
import { buildSolverReplay } from '@/game/solverReplay';
import { scoreHand } from '@/game/scoreAdapter';

function fixture(rinshanWin = false, secondKan = false) {
  const deck = createDeck();
  const take = (suit: Tile['suit'], value: number) => {
    const i = deck.findIndex(t => t.suit === suit && t.value === value && !t.isRed);
    if (i < 0) throw new Error('Missing fixture tile');
    return deck.splice(i, 1)[0];
  };
  const hand = sortHand([... [1,1,4,4,4,8,8,8].map(v => take('pin',v)),
    take('wind',3),take('wind',3),take('dragon',3),take('dragon',3),take('wind',4)]);
  const calls = [take('dragon',3),take('pin',8)];
  const rinshan = take(rinshanWin ? 'pin' : 'wind',rinshanWin ? 1 : 2);
  const wall = [...calls,...(secondKan ? [take('pin',4)] : []),take('pin',1),...[2,3,4,6,7].map(v => take('sou',v))];
  const indicators = [take('dragon',2),take('dragon',2)];
  if (secondKan) indicators.push(take('dragon',2));
  const wanpai = [rinshan,take('wind',1),...deck.splice(0,2),...indicators,...deck.splice(0,10-indicators.length)];
  return { ...makeInitialStateBase(hand,deck.splice(0,13),wall,wanpai,'south','east'),
    mode:'four' as const,nextSeat:'east' as const,roundWind:'east' as const,turnCount:14 };
}

describe('open calls with daiminkan', () => {
  it('improves chun pon plus 11444888p west pair from baiman to sanbaiman', () => {
    const state = fixture();
    const original = JSON.stringify(state);
    const withoutKan = searchWithOpenCalls(state,null,3000,1)!;
    expect(withoutKan.bestScore).toBe(16000);
    const result = searchWithOpenCalls(state,withoutKan,3000,2)!;
    expect(result.bestScore).toBe(24000);
    const frames = buildSolverReplay(state,result);
    expect(frames).toHaveLength(result.line.length + 1);
    const kan = frames.find(f => f.action?.type === 'call-naki' && f.action.option.type === 'daiminkan')!.state;
    expect(kan.playerDrawnTile?.id).toBe(state.wanpai[0].id);
    expect(kan.wall).toEqual(state.wall.slice(2,-1));
    expect(kan.doraCount).toBe(2);
    expect(kan.nextSeat).toBe('west');
    const end = frames[frames.length-1].state;
    expect(end.phase).toBe('win');
    expect(end.winType).toBe('ron');
    expect(end.winFromWind).toBe('west');
    expect(end.turnCount).toBe(15);
    expect(end.playerFuro.map(f => f.type)).toEqual(['pung','daiminkan']);
    expect(Math.max(...scoreHand(end)!.handInterpretations.map(h => h.totalWinnings))).toBe(24000);
    expect(JSON.stringify(state)).toBe(original);
  });
  it('can win on the rinshan tile immediately after daiminkan', () => {
    const state = fixture(true);
    const result = searchWithOpenCalls(state,null,3000,2)!;
    const frames = buildSolverReplay(state,result);
    const end = frames[frames.length-1].state;
    expect(end.winType).toBe('tsumo');
    expect(end.drawnFromRinshan).toBe(true);
    expect(end.winTile?.id).toBe(state.wanpai[0].id);
    expect(result.bestScore).toBe(24000);
  });
  it('counts repeated dora indicators separately in pruning bounds', () => {
    const state = fixture();
    const counts = Array<number>(34).fill(0);
    counts[33] = 3;
    counts[9] = 1;
    expect(openHanUpperBound({...state,doraCount:2},counts,[],[])
      - openHanUpperBound({...state,doraCount:1},counts,[],[])).toBe(3);
  });
  it('cannot daiminkan the final live-wall discard', () => {
    const state = fixture();
    const wall = state.wall.slice(0,2);
    const result = searchWithOpenCalls({...state,wall,fullWall:wall},null,3000,2);
    expect(result).toBeNull();
  });
  it('tracks successive rinshan draws and live-wall supplements across two daiminkan', () => {
    const state = fixture(false,true);
    const result = searchWithOpenCalls(state,null,3000,3)!;
    const frames = buildSolverReplay(state,result);
    const kans = frames.filter(f => f.action?.type === 'call-naki' && f.action.option.type === 'daiminkan');
    expect(kans).toHaveLength(2);
    expect(kans.map(f => f.state.playerDrawnTile?.id)).toEqual(state.wanpai.slice(0,2).map(t => t.id));
    expect(kans[1].state.wall).toEqual(state.wall.slice(3,-2));
    expect(kans[1].state.doraCount).toBe(3);
    expect(frames[frames.length-1].state.phase).toBe('win');
    expect(result.bestScore).toBe(32000);
  });
});
