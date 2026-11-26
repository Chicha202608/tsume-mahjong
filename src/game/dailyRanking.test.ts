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

    expect((await dailyRankingRequest(request('POST', { date: '2026-11-25', token, moves }), env)).status).toBe(409);
    expect((await dailyRankingRequest(request('POST', { date, token, moves: ['ron'] }), env)).status).toBe(422);
    expect((await dailyRankingRequest(request('PATCH', { date, token, name: 'あ'.repeat(21) }), env)).status).toBe(400);
    expect(store).toHaveBeenCalledTimes(2);
  });
});
