import { describe, expect, it } from 'vitest';
import { makeOpenHanemanTestState } from '@/game/testScenarios';
import { findBestNoKanSolution } from '@/game/drawSolution';
import { searchWithAnkan } from '@/game/ankanSearch';
import { searchWithOneOpenCall } from '@/game/openSearch';
import { buildSolverReplay } from '@/game/solverReplay';
import { scoreHand } from '@/game/scoreAdapter';

describe('visible open-haneman examples through the production search stages', () => {
  it.each([
    ['pon','four'], ['chi','four'], ['pon','two'], ['chi','two'],
  ] as const)('%s in %s-player mode beats the closed result with 12,000', (kind, mode) => {
    const initial = makeOpenHanemanTestState(kind,mode);
    const all = [...initial.playerHand,...initial.wall,...initial.wanpai,
      ...(initial.opponents ? initial.opponents.flatMap(o => o.hand) : initial.cpuHand)];
    expect(new Set(all.map(t => t.id)).size).toBe(all.length);
    const closed = searchWithAnkan(initial,findBestNoKanSolution(initial),8000,2);
    expect(closed?.bestScore ?? 0).toBeLessThan(12000);
    const result = searchWithOneOpenCall(initial,closed)!;
    expect(result.bestScore).toBe(12000);
    const frames = buildSolverReplay(initial,result);
    expect(frames.length).toBe(result.line.length+1);
    const final = frames[frames.length-1].state;
    expect(final.phase).toBe('win');
    expect(final.winType).toBe('ron');
    expect(final.playerFuro).toHaveLength(1);
    expect(final.playerFuro[0].type).toBe(kind === 'pon' ? 'pung' : 'chii');
    const scores = scoreHand(final)!.handInterpretations;
    expect(Math.max(...scores.map(s => s.totalWinnings))).toBe(12000);
    console.info('[visible haneman example]', { kind,mode,closedScore: closed?.bestScore,
      openScore: result.bestScore,yaku: scores.filter(s => s.totalWinnings === 12000).map(s => s.yaku.map(y => y.name)) });
  });
});
