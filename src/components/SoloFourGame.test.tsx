import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SoloFourGame from '@/components/SoloFourGame';
import ModeSelect from '@/components/ModeSelect';
import FourPlayerTable from '@/components/FourPlayerTable';
import SoloFourWall from '@/components/SoloFourWall';
import TableMelds from '@/components/TableMelds';
import { createSoloState, soloPerspective, soloWallSeat, applySoloAction } from '@/game/soloFour';
import { SEATS, seatAfter } from '@/game/seatFlow';
import { createDeck } from '@/gameLogic';

describe('solo mode public information and entry point', () => {
  it('offers the new mode alongside both existing modes', () => {
    const html = renderToStaticMarkup(<ModeSelect onSelect={() => {}} />);
    expect(html).toContain('一人四人麻雀');
    expect(html).toContain('二人モード');
    expect(html).toContain('四人モード');
  });

  it('uses the existing table and hand controls, with a wall button instead of an inline wall', () => {
    const html = renderToStaticMarkup(<SoloFourGame onHome={() => {}} />);
    for (const wind of ['east', 'south', 'west', 'north']) {
      expect(html).toContain(`data-river-wind="${wind}"`);
    }
    expect(html).toContain('data-four-table');
    expect(html).toContain('data-hand-wind="east"');
    expect(html).toMatch(/>山<\/button>/);
    expect(html).not.toContain('data-wall-tile');
    expect(html).not.toContain('aria-label="ツモ山"');
    expect(html).toMatch(/[東南西北]場/);
    expect(html).not.toContain('一局');
    expect(html).not.toContain('25,000');
    expect(html).not.toContain('供託');
    expect(html).not.toContain('Back.svg');
    expect(html).not.toContain('伏せ牌');
    expect(html).not.toContain('探索');
    expect(html).not.toContain('AI');
    expect(html).toContain('戻る');
    expect(html).toContain('進む');
    expect(html).toContain('最初');
    expect(html).toContain('最後');
    expect(html.match(/ disabled=""/g)).toHaveLength(5);
  });

  it.each(SEATS)('rotates the public hands and rivers correctly from %s perspective', view => {
    const state = createSoloState();
    state.view = view;
    const html = renderToStaticMarkup(<FourPlayerTable state={soloPerspective(state)} publicSeats={state.seats} activeWind={state.turn} />);
    for (const [relative, angle] of [[1, -90], [2, 180], [3, 90]]) {
      const wind = seatAfter(view, relative);
      const hand = html.match(new RegExp('data-table-hand="' + wind + '"[^>]*style="([^"]*)"'));
      const river = html.match(new RegExp('data-river-wind="' + wind + '"[^>]*style="([^"]*)"'));
      expect(hand?.[1]).toContain(`rotate(${angle}deg)`);
      expect(river?.[1]).toContain(`rotate(${angle}deg)`);
    }
    const ownRiver = html.match(new RegExp('data-river-wind="' + view + '"[^>]*style="([^"]*)"'));
    expect(ownRiver?.[1]).not.toContain('rotate');
    expect(html).not.toContain('Back.svg');
  });

  it('keeps concealed kan visible and stacks the added kan tile on the sideways called tile', () => {
    const tiles = createDeck().slice(0, 4);
    const ankan = renderToStaticMarkup(<TableMelds wind="south" isDora={() => false}
      furo={[{ type: 'ankan', tiles, calledTile: tiles[0] }]} />);
    expect(ankan.match(/alt="一萬"/g)).toHaveLength(4);
    expect(ankan).not.toContain('Back.svg');
    const kakan = renderToStaticMarkup(<TableMelds wind="south" isDora={() => false}
      furo={[{ type: 'kakan', tiles, calledTile: tiles[0], fromWind: 'west' }]} />);
    expect(kakan.match(/rotate\(90deg\)/g)).toHaveLength(2);
    expect(kakan.match(/alt="一萬"/g)).toHaveLength(4);
  });

  it('shows every wall tile and updates highlights for each response viewpoint, then restores them', () => {
    const state = createSoloState();
    const render = () => renderToStaticMarkup(<SoloFourWall state={state} onClose={() => {}} />);
    const highlighted = (html: string) => [...html.matchAll(/data-wall-tile="([^"]*)" data-highlighted="true"/g)].map(m => m[1]);
    const initial = highlighted(render());
    for (const view of SEATS) {
      state.view = view;
      const html = render();
      expect(html).toContain('aria-label="ツモ山"');
      expect(html).toContain('aria-label="山を閉じる"');
      expect(html.match(/data-wall-tile=/g)).toHaveLength(70);
      expect(highlighted(html)).toEqual(state.wall.filter((_, index) => soloWallSeat(state, index) === view).map(tile => tile.id));
      expect(html).not.toContain('Back.svg');
    }
    state.view = 'east';
    expect(highlighted(render())).toEqual(initial);
  });

  it('does not highlight drawn tiles, supplemented wall tiles, or any tiles after hand end', () => {
    const state = createSoloState();
    const html = renderToStaticMarkup(<SoloFourWall state={state} onClose={() => {}} />);
    expect(html).toContain(`data-wall-tile="${state.seats.east.drawn!.id}" data-highlighted="false"`);
    const beforeKan = createSoloState(createDeck());
    const quad = beforeKan.seats.east.hand.filter(tile => tile.suit === 'man' && tile.value === 1);
    const tail = beforeKan.wall[beforeKan.wall.length - 1];
    const afterKan = applySoloAction(beforeKan, { type: 'kan', option: { type: 'ankan', tiles: quad, calledTile: quad[0] } })!;
    const kanWall = renderToStaticMarkup(<SoloFourWall state={afterKan} onClose={() => {}} />);
    expect(kanWall).toContain(`data-wall-tile="${tail.id}" data-highlighted="false"`);
    state.phase = 'end';
    expect(renderToStaticMarkup(<SoloFourWall state={state} onClose={() => {}} />)).not.toContain('data-highlighted="true"');
  });

  it('preserves the existing hidden-opponent table when public seats are not supplied', () => {
    const state = createSoloState();
    const html = renderToStaticMarkup(<FourPlayerTable state={soloPerspective(state)} />);
    expect(html).toContain('Back.svg');
    expect(html).toContain('w-[250px] h-[220px]');
  });
});
