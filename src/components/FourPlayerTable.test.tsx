import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import FourPlayerTable from '@/components/FourPlayerTable';
import { makeDailyRound } from '@/game/dailyRound';

it('keeps the first eighteen discards in three rows and extends the third row for further discards', () => {
  const initial = makeDailyRound('2026-11-25');
  const state = { ...initial, playerDiscards: initial.wall.slice(0, 20) };
  const html = renderToStaticMarkup(<FourPlayerTable state={state} embedded />);
  const start = html.indexOf(`data-river-wind="${state.playerWind}"`);
  const nextRiver = html.indexOf('data-river-wind=', start + 1);
  const ownRiver = html.slice(start, nextRiver);
  const placements = [...ownRiver.matchAll(/grid-row:(\d+);grid-column:(\d+)/g)].map(([, row, column]) => [Number(row), Number(column)]);

  expect(ownRiver).toContain('grid-cols-[repeat(6,40px)]');
  expect(placements).toHaveLength(20);
  expect(placements[5]).toEqual([1, 6]);
  expect(placements[6]).toEqual([2, 1]);
  expect(placements[17]).toEqual([3, 6]);
  expect(placements[19]).toEqual([3, 8]);
});
