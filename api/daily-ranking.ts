import { readDailyRoundDate, todayInJapan } from '../src/game/dailyRound.js';
import { maxRankingMoves, replayDailyScore } from '../src/game/dailyRankingReplay.js';
import { maxRankingNameLength, type DailyRankingBoard } from '../src/game/dailyRankingTypes.js';

declare const process: { env: Record<string, string | undefined> };

const tokenPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function respond(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function readRankingBoard(date: string, url: string, secret: string): Promise<Response> {
  try {
    const target = new URL('/rest/v1/daily_ranking_results', url);
    target.search = new URLSearchParams({
      select: 'id,nickname,score',
      round_date: `eq.${date}`,
      order: 'score.desc,id.asc',
      limit: '10',
    }).toString();
    const upstream = await fetch(target, {
      headers: { apikey: secret, Prefer: 'count=exact' },
      signal: AbortSignal.timeout(8000),
    });
    const count = upstream.headers.get('Content-Range')?.match(/\/(\d+)$/)?.[1];
    if (!upstream.ok || count === undefined) return respond({ error: 'unavailable' }, 503);

    const entries: { id: number; nickname: string; score: number }[] = await upstream.json();
    let rank = 0;
    const rows = entries.map(({ id, nickname, score }, index) => {
      if (entries[index - 1]?.score !== score) rank = index + 1;
      return { id: String(id), rank, name: nickname, score, isYou: false };
    });
    const board: DailyRankingBoard = { date, rows, participants: Number(count) };
    return respond(board);
  } catch {
    return respond({ error: 'unavailable' }, 503);
  }
}

export async function dailyRankingRequest(request: Request, env: { url?: string; secret?: string }): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'POST' && request.method !== 'PATCH') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, POST, PATCH' } });
  }
  const { url, secret } = env;
  if (!url || !secret) return respond({ error: 'unavailable' }, 503);

  let body: Record<string, unknown>;
  try {
    if (request.method === 'GET') {
      const params = new URL(request.url).searchParams;
      if (params.get('view') === 'board') return readRankingBoard(todayInJapan(), url, secret);
      body = { date: params.get('date'), token: request.headers.get('X-Daily-Ranking-Token') };
    } else {
      const raw = await request.text();
      if (raw.length > 8192) return respond({ error: 'invalid' }, 413);
      body = JSON.parse(raw);
      if (!body || typeof body !== 'object' || Array.isArray(body)) return respond({ error: 'invalid' }, 400);
    }
  } catch {
    return respond({ error: 'invalid' }, 400);
  }

  const { date, token, moves, name } = body;
  if (typeof date !== 'string' || readDailyRoundDate(`?daily=${encodeURIComponent(date)}`) !== date
      || typeof token !== 'string' || !tokenPattern.test(token)) {
    return respond({ error: 'invalid' }, 400);
  }
  if (date !== todayInJapan()) return respond({ error: 'closed' }, 409);

  let score: number | null = null;
  let nickname: string | null = null;
  if (request.method === 'POST') {
    if (!Array.isArray(moves) || moves.length > maxRankingMoves
        || !moves.every(move => typeof move === 'string' && move.length <= 34)) {
      return respond({ error: 'invalid' }, 400);
    }
    try {
      score = replayDailyScore(date, moves);
    } catch {
      return respond({ error: 'invalid' }, 422);
    }
    if (score === null) return respond({ error: 'invalid' }, 422);
  } else if (request.method === 'PATCH') {
    if (typeof name !== 'string') return respond({ error: 'invalid_name' }, 400);
    nickname = name.trim();
    if ([...nickname].length > maxRankingNameLength || /[\p{Cc}\u202A-\u202E\u2066-\u2069]/u.test(nickname)) {
      return respond({ error: 'invalid_name' }, 400);
    }
    nickname ||= '名無し';
  }

  try {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    const playerKey = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
    const upstream = await fetch(new URL('/rest/v1/rpc/save_daily_ranking', url), {
      method: 'POST',
      headers: { apikey: secret, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_date: date, p_player_key: playerKey, p_score: score, p_name: nickname }),
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) return respond({ error: 'unavailable' }, 503);
    const data = await upstream.json();
    return data ? respond(data) : respond({ error: 'missing' }, 404);
  } catch {
    return respond({ error: 'unavailable' }, 503);
  }
}

export default {
  fetch(request: Request) {
    if (process.env.VITE_DAILY_RANKING_ENABLED !== 'true') return respond({ error: 'unavailable' }, 503);
    return dailyRankingRequest(request, {
      url: process.env.SUPABASE_URL,
      secret: process.env.SUPABASE_SECRET_KEY,
    });
  },
};
