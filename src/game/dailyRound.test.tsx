import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '@/App';
import { dailyRoundSearch, makeDailyRound, millisecondsUntilJapanMidnight, readDailyRoundDate, todayInJapan } from '@/game/dailyRound';
import * as gameEngine from '@/game/useGameEngine';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('daily round', () => {
  it('changes dates at midnight in Japan', () => {
    expect(todayInJapan(new Date('2026-11-24T14:59:59.999Z'))).toBe('2026-11-24');
    expect(todayInJapan(new Date('2026-11-24T15:00:00.000Z'))).toBe('2026-11-25');
    expect(millisecondsUntilJapanMidnight(new Date('2026-11-24T14:59:59.999Z'))).toBe(1);
  });

  it('accepts dated links and rejects invalid calendar dates', () => {
    expect(readDailyRoundDate(dailyRoundSearch('2024-02-29'))).toBe('2024-02-29');
    expect(readDailyRoundDate('?daily=2026-02-29')).toBeNull();
    expect(readDailyRoundDate('?daily=2026-11-31')).toBeNull();
    expect(readDailyRoundDate('?daily=2026-11-5')).toBeNull();
  });

  it('recreates every seat, hand, and wall without using ambient randomness', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const original = makeDailyRound('2026-11-25');
    random.mockReturnValue(0.9);
    expect(makeDailyRound('2026-11-25')).toEqual(original);
    expect(makeDailyRound('2026-11-26').fullWall).not.toEqual(original.fullWall);
    expect(original.mode).toBe('four');
    expect(original.fullWall).toHaveLength(70);
    expect(random).not.toHaveBeenCalled();
  });

  it('offers a home link and opens a shared date directly on the same table', () => {
    vi.stubGlobal('window', { location: new URL('https://tsume.example/') });
    const home = renderToStaticMarkup(<App />);
    expect(home).toContain('href="?daily=today"');

    vi.stubGlobal('window', { location: new URL('https://tsume.example/?daily=2026-11-25') });
    const original = renderToStaticMarkup(<App />);
    expect(original).toContain('data-four-table');
    expect(original).toContain('dateTime="2026-11-25"');
    expect(original).not.toMatch(/同じ局をやり直す|新局/);

    vi.stubGlobal('window', { location: new URL('https://tsume.example/?daily=2026-11-25&example=four-pon-kakan') });
    expect(renderToStaticMarkup(<App />)).toBe(original);
  });

  it('hides analysis through the end of today’s round and restores it for yesterday’s round', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-25T00:00:00Z'));
    const useEngine = gameEngine.useGameEngine;
    vi.spyOn(gameEngine, 'useGameEngine').mockImplementation((...args) => {
      const engine = useEngine(...args);
      return { ...engine, state: { ...engine.state, phase: 'exhausted' } };
    });

    vi.stubGlobal('window', { location: new URL('https://tsume.example/?daily=2026-11-25') });
    const today = renderToStaticMarkup(<App />);
    expect(today).toContain('流局');
    expect(today).toContain('Xでシェア');
    expect(today).toContain(encodeURIComponent('私は0点でした。'));
    expect(today).not.toMatch(/>AI<|AIの手順|AIの得点|AIとの点差|探索結果|もう一局|同じ局をやり直す|新局/);

    vi.stubGlobal('window', { location: new URL('https://tsume.example/?daily=2026-11-24') });
    const yesterday = renderToStaticMarkup(<App />);
    expect(yesterday).toContain('>AI<');
    expect(yesterday).not.toMatch(/もう一局|同じ局をやり直す|新局/);
  });
});
