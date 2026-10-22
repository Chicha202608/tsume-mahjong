import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { State } from '@/game/gameState';
import type { SolverResult } from '@/game/solver';
import { makeInitialStateBase } from '@/game/gameState';

const stages = vi.hoisted(() => ({ nuki:vi.fn(), closed:vi.fn(), ankan:vi.fn(), open:vi.fn() }));
vi.mock('@/game/openSearch', () => ({ searchWithNuki:stages.nuki, searchWithOpenCalls:stages.open }));
vi.mock('@/game/drawSolution', () => ({ findBestNoKanSolution:stages.closed }));
vi.mock('@/game/ankanSearch', () => ({ searchWithAnkan:stages.ankan }));
const result = (score:number): SolverResult => ({ supported:true, complete:false, outcome:'win', bestScore:score,
  line:[], stats:{statesVisited:0,cacheHits:0,prunedBranches:0,elapsedMs:0} });

describe('worker search-stage ordering', () => {
  const initial = makeInitialStateBase([], [], [], [], 'east', 'south');
  const worker = { onmessage:null as null | ((event: MessageEvent<State>) => void), postMessage:vi.fn() };
  beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks();
    vi.stubGlobal('self',worker);
    stages.nuki.mockReturnValue(result(16000)); stages.closed.mockReturnValue(result(8000));
    stages.ankan.mockImplementation((_state,baseline) => baseline);
    stages.open.mockImplementation((_state,baseline) => baseline);
    await import('@/game/solver.worker');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('publishes north-first before retained-north search and carries its score into later stages', () => {
    worker.onmessage!({data:{...initial,mode:'three'}} as MessageEvent<State>);
    expect(stages.nuki.mock.invocationCallOrder[0]).toBeLessThan(stages.closed.mock.invocationCallOrder[0]);
    expect(worker.postMessage.mock.calls[0][0].result.bestScore).toBe(16000);
    expect(stages.ankan.mock.calls[0][1].bestScore).toBe(16000);
    expect(stages.open.mock.calls[0][1].bestScore).toBe(16000);
    const context = stages.nuki.mock.calls[0][5];
    expect(stages.closed.mock.calls[0][1]).toMatchObject({minimumScore:16000});
    expect(stages.closed.mock.calls[0][1].context).toBe(context);
    expect(stages.ankan.mock.calls[0][5]).toBe(context);
    expect(stages.open.mock.calls[0][7]).toBe(context);
    expect(worker.postMessage.mock.calls.slice(-1)[0][0]).toMatchObject({preliminary:false,result:{bestScore:16000}});
  });

  it('allows a stronger retained-north result to replace the preferred result', () => {
    stages.closed.mockReturnValue(result(32000));
    worker.onmessage!({data:{...initial,mode:'three'}} as MessageEvent<State>);
    expect(stages.open.mock.calls[0][1].bestScore).toBe(32000);
  });

  it.each(['two','four'])('preserves the existing stage order for %s', mode => {
    worker.onmessage!({data:{...initial,mode}} as MessageEvent<State>);
    expect(stages.nuki).not.toHaveBeenCalled();
    expect(stages.ankan.mock.calls[0][1].bestScore).toBe(8000);
  });

  it('keeps the north-first answer if a later search fails', () => {
    stages.closed.mockImplementationOnce(() => { throw new Error('test failure'); });
    worker.onmessage!({data:{...initial,mode:'three'}} as MessageEvent<State>);
    expect(worker.postMessage.mock.calls.slice(-1)[0][0]).toMatchObject({preliminary:false,result:{bestScore:16000}});
  });

  it('finishes with the best published answer when the global deadline expires', () => {
    let now = 0;
    const clock = vi.spyOn(Date,'now').mockImplementation(() => now);
    try {
      stages.nuki.mockImplementationOnce(() => { now = 60001; return result(16000); });
      worker.onmessage!({data:{...initial,mode:'three'}} as MessageEvent<State>);
      expect(stages.closed).not.toHaveBeenCalled();
      expect(stages.ankan).not.toHaveBeenCalled();
      expect(stages.open).not.toHaveBeenCalled();
      expect(worker.postMessage.mock.calls.slice(-1)[0][0]).toMatchObject({preliminary:false,result:{bestScore:16000}});
    } finally { clock.mockRestore(); }
  });

  it.each([['east', 48000], ['south', 32000]] as const)('stops at the attainable ceiling for %s', (playerWind, score) => {
    stages.nuki.mockImplementationOnce((_state, _baseline, _duration, _stats, progress, context) => {
      progress(result(score));
      expect(context.shouldStop()).toBe(true);
      return result(score);
    });
    worker.onmessage!({ data: { ...initial, mode: 'three', playerWind } } as MessageEvent<State>);
    expect(stages.closed).not.toHaveBeenCalled();
    expect(stages.ankan).not.toHaveBeenCalled();
    expect(stages.open).not.toHaveBeenCalled();
    expect(worker.postMessage.mock.calls.slice(-1)[0][0]).toMatchObject({ preliminary: false, result: { bestScore: score } });
  });

  it('skips mixed calls once the concealed-kan stage reaches the ceiling', () => {
    stages.ankan.mockReturnValueOnce(result(48000));
    worker.onmessage!({ data: { ...initial, mode: 'three' } } as MessageEvent<State>);
    expect(stages.open).not.toHaveBeenCalled();
    expect(worker.postMessage.mock.calls.slice(-1)[0][0]).toMatchObject({ preliminary: false, result: { bestScore: 48000 } });
  });

  it('continues beyond 48000 when remaining material permits stacked yakuman', () => {
    const playerHand = [1, 2, 3, 4].flatMap(value => Array.from({ length: 3 }, (_, i) =>
      ({ suit: 'wind' as const, value, id: `wind-${value}-${i}` })));
    stages.nuki.mockReturnValueOnce(result(48000));
    worker.onmessage!({ data: { ...initial, mode: 'three', playerHand } } as MessageEvent<State>);
    expect(stages.closed).toHaveBeenCalled();
    expect(stages.ankan).toHaveBeenCalled();
    expect(stages.open).toHaveBeenCalled();
  });
});
