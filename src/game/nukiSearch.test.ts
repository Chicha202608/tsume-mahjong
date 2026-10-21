import { describe, expect, it } from 'vitest';
import type { Tile } from '@/types';
import { makeInitialStateBase, type State } from '@/game/gameState';
import { searchWithNuki, searchWithOpenCalls, threePlayerHanUpperBound, threePlayerScoreUpperBound, type OpenSearchStats } from '@/game/openSearch';
import { buildSolverReplay } from '@/game/solverReplay';
import { scoreHand } from '@/game/scoreAdapter';
import { findBestNoKanSolution } from '@/game/drawSolution';

let serial = 0;
const tile = (suit: Tile['suit'], value: number, isRed = false): Tile => ({ suit, value, isRed, id: `nuki-search-${serial++}` });
const tiles = (suit: Tile['suit'], values: number[]) => values.map(v => tile(suit,v));
const tenpai = () => [...tiles('pin',[1,2,3,4,5,6]), ...tiles('sou',[2,3,5,5,6,7,8])];
const face = (t: Tile) => (t.suit === 'man' ? 0 : t.suit === 'pin' ? 9 : t.suit === 'sou' ? 18 : t.suit === 'wind' ? 27 : 31) + t.value - 1;
const counts = (hand: Tile[]) => { const n = Array<number>(34).fill(0); hand.forEach(t => n[face(t)]++); return n; };
function fixture(wall = [tile('wind',4),tile('wind',1),tile('sou',1)], hand = tenpai()): State {
  return { ...makeInitialStateBase(hand, [], wall, [], 'east','south'), mode:'three', nextSeat:'east',
    phase:'playerDraw', roundWind:'east', playerNuki:[] };
}
function verify(state: State, result: NonNullable<ReturnType<typeof searchWithNuki>>) {
  const frames = buildSolverReplay(state,result);
  expect(frames).toHaveLength(result.line.length + 1);
  const final = frames[frames.length - 1].state;
  expect(final.phase).toBe('win');
  expect(scoreHand(final)!.handInterpretations[0].totalWinnings).toBe(result.bestScore);
  return final;
}

describe('north-first target preparation', () => {
  it.each([1,2,3,4])('enumerates one plan for %i consecutive north extractions', northCount => {
    const wall = [tile('wind',4),tile('wind',1),tile('sou',1), ...tiles('wind',Array(northCount - 1).fill(4))];
    const initial = fixture(wall);
    let stats: OpenSearchStats | undefined;
    const result = searchWithNuki(initial,null,1000,s => { stats = s; })!;
    expect(stats!.preparedNukiCount).toBe(northCount);
    expect(stats!.callCandidates).toBe(1);
    expect(stats!.targets).toBe(stats!.prunedTargets + stats!.replayedLines);
    expect(verify(initial,result).playerNuki).toHaveLength(northCount);
    expect(initial.wall).toEqual(wall);
    expect(initial.playerNuki).toHaveLength(0);
  });

  it('can finish a win before the rest of the prepared north schedule', () => {
    const initial = fixture([tile('wind',4),tile('wind',1),tile('wind',2),tile('wind',4),tile('wind',1),
      tile('wind',2),tile('wind',3),tile('wind',4),tile('sou',1)]);
    let stats: OpenSearchStats | undefined;
    const result = searchWithNuki(initial,null,1000,s => { stats = s; })!;
    expect(stats!.preparedNukiCount).toBe(3);
    const win = verify(initial,result);
    expect(win.playerNuki).toHaveLength(1);
    expect(win.wallDrawnCount).toBe(1);
  });

  it('retains the baseline without a usable north or time budget', () => {
    const initial = fixture();
    const baseline = findBestNoKanSolution(initial);
    expect(searchWithNuki(initial,baseline,0)).toBe(baseline);
    expect(searchWithNuki({ ...initial, mode:'four' },baseline,1000)).toBe(baseline);
    expect(searchWithNuki(fixture([tile('pin',9)]),baseline,1000)).toBe(baseline);
  });

  it('retains the north-containing kokushi alternative in the fallback', () => {
    const hand = [...tiles('man',[1,9]), ...tiles('pin',[1,9]), ...tiles('sou',[1,9]),
      ...tiles('wind',[1,2,3,4]), ...tiles('dragon',[1,2,3])];
    const initial = fixture([tile('man',1),tile('pin',5),tile('sou',5)],hand);
    const preferred = searchWithNuki(initial,null,1000);
    const retained = findBestNoKanSolution(initial)!;
    expect(retained.bestScore).toBeGreaterThan(preferred?.bestScore ?? -1);
    expect(verify(initial,retained).playerNuki).toHaveLength(0);
  });

  it('keeps the seeded score while rejecting targets that cannot precede any winning tile', () => {
    const initial = fixture([tile('wind',4),tile('wind',1),tile('sou',1),tile('wind',4)]);
    initial.playerNuki = [tile('wind',4)];
    let stats: OpenSearchStats | undefined;
    const preferred = searchWithNuki(initial,null,1000);
    const result = searchWithOpenCalls(initial,preferred,1000,4,s => { stats = s; })!;
    expect(result.bestScore).toBeGreaterThanOrEqual(preferred!.bestScore!);
    verify(initial,result);
    expect(stats!.unreachableTargets).toBeGreaterThan(0);
    expect(stats!.replayedLines).toBeLessThan(stats!.targets);
  });
});

describe('safe three-player pruning bounds', () => {
  it('does not prune a red winning five that is also present in the material pool', () => {
    const hand = [...tiles('pin',[1,2,3,4,5,6]), ...tiles('sou',[2,3,4,6,7,8,5])];
    const redWin = tile('sou',5,true);
    const initial = fixture([redWin],hand);
    const target = { counts:counts(hand), waits:[face(redWin)], earliestPlayerDraw:0 };
    const upper = threePlayerScoreUpperBound(initial,target,[...hand,redWin],[redWin]);
    const win = { ...initial, phase:'win' as const, winType:'tsumo' as const, winTile:redWin,
      isRiichi:true,isIppatsu:true,playerDrawnTile:redWin,wall:[] };
    expect(upper).toBeGreaterThanOrEqual(scoreHand(win)!.handInterpretations[0].totalWinnings);
    expect(upper).toBeGreaterThan(0);
  });

  it('includes closed-only yakuman and north ura bonuses in the han bound', () => {
    const initial = fixture();
    const orphans = [...tiles('man',[1,9]), ...tiles('pin',[1,9]), ...tiles('sou',[1,9]),
      ...tiles('wind',[1,2,3,4]), ...tiles('dragon',[1,2,3]),tile('man',1)];
    expect(threePlayerHanUpperBound(initial,counts(orphans),[],orphans)).toBe(Infinity);
    const ordinary = [...tenpai(),tile('sou',1)];
    const base = threePlayerHanUpperBound(initial,counts(ordinary),[],ordinary);
    initial.playerNuki = tiles('wind',[4,4]);
    initial.wanpai = Array.from({length:14}, () => tile('dragon',1));
    initial.wanpai[4] = tile('wind',3); initial.wanpai[9] = tile('wind',3);
    expect(threePlayerHanUpperBound(initial,counts(ordinary),[],ordinary)).toBeGreaterThanOrEqual(base + 6);
  });
});
