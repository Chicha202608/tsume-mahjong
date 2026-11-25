import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import ShareResultLink from '@/components/ShareResultLink';
import { makeDailyShare } from '@/components/dailyShareImage';
import { makeDailyRound } from '@/game/dailyRound';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('prefills the Japanese result and links to the app home without the current query or fragment', () => {
  vi.stubEnv('VITE_DAILY_SHARE_ORIGIN', 'https://play.tsume.example');
  vi.stubGlobal('window', { location: new URL('https://tsume.example/?example=test#current-game') });
  const html = renderToStaticMarkup(<ShareResultLink result="四人モードでロン：12,000点" className="" />);
  const href = html.match(/href="([^"]+)"/)?.[1] ?? '';
  const shareUrl = new URL(href.replace(/&amp;/g, '&'));

  expect(shareUrl.origin + shareUrl.pathname).toBe('https://twitter.com/intent/tweet');
  expect(shareUrl.searchParams.get('text')).toBe(
    'ツモ山が全部見える麻雀。あなたなら何点取れる？\n\n私の結果：四人モードでロン：12,000点\n\n詰め麻雀で遊ぶ ↓',
  );
  expect(shareUrl.searchParams.get('url')).toBe('https://tsume.example/');
  expect(shareUrl.searchParams.get('hashtags')).toBe('詰め麻雀');
  expect(html).toContain('target="_blank"');
});

it('shares the date of the played round even after the newest daily round changes', () => {
  vi.stubEnv('VITE_DAILY_SHARE_ORIGIN', '');
  vi.stubGlobal('window', { location: new URL('https://tsume.example/?daily=today') });
  const date = '2026-11-25';
  const dailyShare = makeDailyShare(date, makeDailyRound(date));
  const html = renderToStaticMarkup(<ShareResultLink result="12,000点" dailyShare={dailyShare} className="" />);
  const href = html.match(/href="([^"]+)"/)?.[1] ?? '';
  const shareUrl = new URL(href.replace(/&amp;/g, '&'));

  expect(shareUrl.searchParams.get('url')).toBe('https://tsume.example/?daily=2026-11-25');
  expect(shareUrl.searchParams.get('text')).toBe(
    '詰め麻雀｜2026-11-25の一局\n私は12,000点でした。同じ牌山で、あなたなら何点取れる？\nこの一局を打つ ↓',
  );
  expect(html).toContain('<dialog');
  expect(html).toContain('Xの投稿画面を開く');
});

it('shares the production URL and the same round date when opened from a Vercel preview', () => {
  vi.stubEnv('VITE_DAILY_SHARE_ORIGIN', 'https://play.tsume.example');
  vi.stubGlobal('window', { location: new URL('https://preview-tsume.vercel.app/?daily=2026-11-25&example=test#game') });
  const date = '2026-11-25';
  const dailyShare = makeDailyShare(date, makeDailyRound(date));
  const html = renderToStaticMarkup(<ShareResultLink result="0点" dailyShare={dailyShare} className="" />);
  const href = html.match(/href="([^"]+)"/)?.[1] ?? '';
  const shareUrl = new URL(href.replace(/&amp;/g, '&'));

  expect(shareUrl.searchParams.get('url')).toBe('https://play.tsume.example/?daily=2026-11-25');
});

it('uses the tile worth a bonus rather than the initial indicator', () => {
  const date = '2026-11-25';
  const initial = makeDailyRound(date);
  expect(initial.wanpai[4]).toMatchObject({ suit: 'pin', value: 4 });
  expect(makeDailyShare(date, initial).dora).toMatchObject({ suit: 'pin', value: 5 });
});
