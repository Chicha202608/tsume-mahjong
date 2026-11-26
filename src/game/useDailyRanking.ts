import { useCallback, useEffect, useRef, useState } from 'react';
import { todayInJapan } from './dailyRound';
import type { DailyRanking } from './dailyRankingTypes';

const storageKey = 'tsume-mahjong:daily-ranking';

interface RankingEntry {
  date: string;
  token: string;
  moves: readonly string[];
}

function readSavedEntry(date: string): RankingEntry | undefined {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return undefined;
  const entry: RankingEntry | null = JSON.parse(saved);
  if (entry?.date === date && typeof entry.token === 'string' && Array.isArray(entry.moves)) return entry;
}

function saveFirstEntry(date: string, moves: readonly string[]): Promise<RankingEntry> | RankingEntry {
  const save = () => {
    if (date !== todayInJapan()) throw new Error('closed');
    const existing = readSavedEntry(date);
    if (existing) return existing;
    const entry: RankingEntry = { date, token: crypto.randomUUID(), moves };
    localStorage.setItem(storageKey, JSON.stringify(entry));
    return entry;
  };
  return navigator.locks ? navigator.locks.request(storageKey, save) : save();
}

async function requestRanking(method: 'POST' | 'PATCH', body: object): Promise<DailyRanking> {
  const response = await fetch('/api/daily-ranking', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: method === 'POST',
    signal: AbortSignal.timeout(12000),
  });
  if (response.status === 409) throw new Error('closed');
  if (method === 'PATCH' && response.status === 400) throw new Error('invalid_name');
  if (!response.ok) throw new Error('unavailable');
  return response.json();
}

export function useDailyRanking(date: string | undefined) {
  const firstMoves = useRef<readonly string[]>();
  const entry = useRef<RankingEntry>();
  const inFlight = useRef(false);
  const [result, setResult] = useState<DailyRanking>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [closed, setClosed] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);

  useEffect(() => {
    if (!date) return;
    const controller = new AbortController();
    async function restoreRegistration(roundDate: string) {
      try {
        const saved = readSavedEntry(roundDate);
        if (!saved) return;
        const response = await fetch(`/api/daily-ranking?date=${encodeURIComponent(roundDate)}`, {
          headers: { 'X-Daily-Ranking-Token': saved.token },
          signal: controller.signal,
        });
        if (!response.ok) return;
        const previous: DailyRanking = await response.json();
        if (!controller.signal.aborted) setResult(current => current ?? previous);
      } catch {
        // Keep the first attempt protected until the server confirms its registration.
      }
    }
    void restoreRegistration(date);
    return () => controller.abort();
  }, [date]);

  const send = useCallback(async (method: 'POST' | 'PATCH', name?: string) => {
    if (!date || !firstMoves.current || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    setNameSaved(false);
    try {
      entry.current ??= await saveFirstEntry(date, firstMoves.current);
      const { token, moves: recordedMoves } = entry.current;
      setResult(await requestRanking(method, method === 'POST' ? { date, token, moves: recordedMoves } : { date, token, name }));
      setNameSaved(method === 'PATCH');
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : '';
      setClosed(reason === 'closed');
      setError(reason === 'closed' ? 'この日のランキング受付は終了しました。'
        : reason === 'invalid_name' ? '使えない文字が含まれています。名前を確認してください。'
        : method === 'PATCH' ? '名前を保存できませんでした。' : 'ランキングに結果を登録できませんでした。');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [date]);

  const record = useCallback((moves: readonly string[]) => {
    if (!date || firstMoves.current) return;
    firstMoves.current = moves;
    void send('POST');
  }, [date, send]);

  return {
    result, busy, error, closed, nameSaved, record,
    retry: () => void send('POST'),
    saveName: (name: string) => void send('PATCH', name),
  };
}
