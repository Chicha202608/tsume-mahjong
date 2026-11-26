import { makeInitialState } from './gameState';

const japanTimeOffsetMs = 9 * 60 * 60 * 1000;

export function todayInJapan(now = new Date()): string {
  return new Date(now.getTime() + japanTimeOffsetMs).toISOString().slice(0, 10);
}

export function millisecondsUntilJapanMidnight(now = new Date()): number {
  const todayStart = Date.parse(`${todayInJapan(now)}T00:00:00+09:00`);
  return todayStart + 24 * 60 * 60 * 1000 - now.getTime();
}

export function dailyRoundSearch(date: string): string {
  return `?daily=${encodeURIComponent(date)}`;
}

export function readDailyRoundDate(search: string): string | null {
  const date = new URLSearchParams(search).get('daily');
  if (date === 'today') return todayInJapan();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}

export function makeDailyRound(date: string) {
  // Mulberry32. Keep the sequence stable so existing links reproduce their deal.
  let seed = Number(date.replace(/-/g, ''));
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), seed | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
  return makeInitialState('four', random);
}
