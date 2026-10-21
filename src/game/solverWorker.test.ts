import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { State } from '@/game/gameState';
import type { SolverResult } from '@/game/solver';

const stages = vi.hoisted(() => ({ nuki:vi.fn(), closed:vi.fn(), ankan:vi.fn(), open:vi.fn() }));
vi.mock('@/game/openSearch', () => ({ searchWithNuki:stages.nuki, searchWithOpenCalls:stages.open }));
vi.mock('@/game/drawSolution', () => ({ findBestNoKanSolution:stages.closed }));
vi.mock('@/game/ankanSearch', () => ({ searchWithAnkan:stages.ankan }));
const result = (score:number): SolverResult => ({ supported:true, complete:false, outcome:'win', bestScore:score,
  line:[], stats:{statesVisited:0,cacheHits:0,prunedBranches:0,elapsedMs:0} });

describe('worker search-stage ordering', () => {
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
    worker.onmessage!({data:{mode:'three'}} as MessageEvent<State>);
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
    worker.onmessage!({data:{mode:'three'}} as MessageEvent<State>);
    expect(stages.open.mock.calls[0][1].bestScore).toBe(32000);
  });

  it.each(['two','four'])('preserves the existing stage order for %s', mode => {
    worker.onmessage!({data:{mode}} as MessageEvent<State>);
    expect(stages.nuki).not.toHaveBeenCalled();
    expect(stages.ankan.mock.calls[0][1].bestScore).toBe(8000);
  });

  it('keeps the north-first answer if a later search fails', () => {
    stages.closed.mockImplementationOnce(() => { throw new Error('test failure'); });
    worker.onmessage!({data:{mode:'three'}} as MessageEvent<State>);
    expect(worker.postMessage.mock.calls.slice(-1)[0][0]).toMatchObject({preliminary:false,result:{bestScore:16000}});
  });

  it('finishes with the best published answer when the global deadline expires', () => {
    let now = 0;
    const clock = vi.spyOn(Date,'now').mockImplementation(() => now);
    try {
      stages.nuki.mockImplementationOnce(() => { now = 60001; return result(16000); });
      worker.onmessage!({data:{mode:'three'}} as MessageEvent<State>);
      expect(stages.closed).not.toHaveBeenCalled();
      expect(stages.ankan).not.toHaveBeenCalled();
      expect(stages.open).not.toHaveBeenCalled();
      expect(worker.postMessage.mock.calls.slice(-1)[0][0]).toMatchObject({preliminary:false,result:{bestScore:16000}});
    } finally { clock.mockRestore(); }
  });
});
