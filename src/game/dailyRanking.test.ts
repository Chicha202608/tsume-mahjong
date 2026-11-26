import { afterEach, describe, expect, it, vi } from 'vitest';
import { dailyRankingRequest } from '../../api/daily-ranking';
import { makeDailyRound } from './dailyRound';
import { replayDailyScore } from './dailyRankingReplay';
import { drawSettlement } from './drawSettlement';
import { applyCpuTurn, applyPassNaki, applyPlayerDiscard, applyPlayerDraw } from './transitions';

const date = '2026-11-26';
const token = '3e6bd86d-f758-4bc9-a8bf-b0ddaa5809a8';

function playToDraw() {
  const moves: string[] = [];
  let state = makeDailyRound(date);
  while (state.phase !== 'exhausted') {
    if (state.phase === 'cpuTurn') state = applyCpuTurn(state)!;
    else if (state.phase === 'playerDraw') state = applyPlayerDraw(state)!;
    else if (state.phase === 'naki') {
      moves.push('passNaki');
      state = applyPassNaki(state)!;
    } else {
      moves.push(`discard:${state.playerDrawnTile!.id}`);
      state = applyPlayerDiscard(state, state.playerDrawnTile!)!;
    }
  }
  return { moves, score: drawSettlement(state)!.score };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('daily ranking', () => {
  it('returns the current Japanese day’s top scores with tied ranks and no player keys', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-25T15:00:00Z'));
    const env = { url: 'https://db.example', secret: 'sb_secret_test' };
    const request = new Request('https://play.example/api/daily-ranking?view=board&date=2026-11-25');
    const store = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json([
      { id: 42, nickname: '白牌', score: 8000, player_key: 'private' },
      { id: 49, nickname: '名無し', score: 8000 },
      { id: 12, nickname: '東', score: 3000 },
    ], { headers: { 'Content-Range': '0-2/12' } })).mockResolvedValueOnce(
      Response.json([], { headers: { 'Content-Range': '*/0' } }),
    );
    vi.stubGlobal('fetch', store);

    const board = await (await dailyRankingRequest(request, env)).json();
    expect(board).toEqual({ date, participants: 12, rows: [
      { id: '42', name: '白牌', score: 8000, rank: 1, isYou: false },
      { id: '49', name: '名無し', score: 8000, rank: 1, isYou: false },
      { id: '12', name: '東', score: 3000, rank: 3, isYou: false },
    ] });
    const [target, options] = store.mock.calls[0];
    const url = new URL(String(target));
    expect(url.pathname).toBe('/rest/v1/daily_ranking_results');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      select: 'id,nickname,score', round_date: `eq.${date}`, order: 'score.desc,id.asc', limit: '10',
    });
    expect(new Headers(options?.headers).get('Prefer')).toBe('count=exact');
    expect(await (await dailyRankingRequest(request, env)).json()).toEqual({ date, participants: 0, rows: [] });
  });

  it('scores a full replay and rejects forged actions and incomplete or extended games', () => {
    const { moves, score } = playToDraw();
    expect(replayDailyScore(date, moves)).toBe(score);
    expect(replayDailyScore(date, moves.slice(0, -1))).toBeNull();
    expect(replayDailyScore(date, [...moves, 'ron'])).toBeNull();
    const discardIndex = moves.findIndex(move => move.startsWith('discard:'));
    const illegal = [...moves];
    illegal[discardIndex] = 'discard:999';
    expect(replayDailyScore(date, illegal)).toBeNull();
  });

  it('scores a legal riichi and tsumo using the same scoring as the game', () => {
    const moves = [
      'passNaki', 'discard:115', 'discard:86', 'discard:109', 'discard:7', 'passNaki', 'discard:15',
      'discard:66', 'passNaki', 'discard:102', 'discard:80', 'discard:73', 'discard:105', 'discard:71',
      'discard:98', 'discard:14', 'passNaki', 'discard:74', 'discard:3', 'passTsumo', 'riichi', 'discard:31', 'tsumo',
    ];
    expect(replayDailyScore('2026-11-25', moves)).toBe(16000);
  });

  it('sends the server-calculated score and hashes the browser token before storage', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${date}T00:00:00Z`));
    const { moves, score } = playToDraw();
    const env = { url: 'https://db.example', secret: 'sb_secret_test' };
    const request = (method: string, body: object) => new Request('https://play.example/api/daily-ranking', {
      method, body: JSON.stringify(body),
    });
    const store = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ rows: [], participants: 1 }));
    vi.stubGlobal('fetch', store);

    expect((await dailyRankingRequest(request('POST', { date, token, moves, score: 999_999 }), env)).status).toBe(200);
    const [target, options] = store.mock.calls[0];
    const submitted = JSON.parse(String(options?.body));
    expect(String(target)).toBe('https://db.example/rest/v1/rpc/save_daily_ranking');
    expect(submitted).toMatchObject({ p_date: date, p_score: score, p_name: null, p_player_key: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(String(options?.body)).not.toContain(token);

    expect((await dailyRankingRequest(request('PATCH', { date, token, name: '　 ' }), env)).status).toBe(200);
    expect(JSON.parse(String(store.mock.calls[1][1]?.body))).toMatchObject({ p_score: null, p_name: '名無し', p_player_key: submitted.p_player_key });

    const lookup = new Request(`https://play.example/api/daily-ranking?date=${date}`, {
      headers: { 'X-Daily-Ranking-Token': token },
    });
    const saved = await dailyRankingRequest(lookup, env);
    expect(saved.status).toBe(200);
    expect(saved.headers.get('Cache-Control')).toBe('no-store');
    expect(JSON.parse(String(store.mock.calls[2][1]?.body))).toMatchObject({ p_score: null, p_name: null, p_player_key: submitted.p_player_key });
    expect((await dailyRankingRequest(new Request(lookup.url), env)).status).toBe(400);

    expect((await dailyRankingRequest(request('POST', { date: '2026-11-25', token, moves }), env)).status).toBe(409);
    expect((await dailyRankingRequest(request('POST', { date, token, moves: ['ron'] }), env)).status).toBe(422);
    expect((await dailyRankingRequest(request('PATCH', { date, token, name: 'あ'.repeat(21) }), env)).status).toBe(400);
    expect(store).toHaveBeenCalledTimes(3);
  });
});
