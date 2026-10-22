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
    expect(html).toMatch(/<button type="button" aria-label="牌の公開" aria-pressed="true"[^>]*>公開<\/button>/);
    expect(html).not.toContain('<select');
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

  it.each(SEATS)('hides only the other seats and unrevealed indicators from %s perspective', view => {
    const state = createSoloState();
    state.view = view;
    const render = (revealTiles: boolean) => renderToStaticMarkup(<FourPlayerTable
      state={soloPerspective(state)} publicSeats={state.seats} activeWind={state.turn} revealTiles={revealTiles} />);
    const hidden = render(false);
    const otherSeats = SEATS.filter(wind => wind !== view);
    const concealedCount = otherSeats.reduce((count, wind) => count + state.seats[wind].hand.length + Number(!!state.seats[wind].drawn), 0);
    expect(hidden.match(/alt="伏せ牌"/g)).toHaveLength(concealedCount + 4);
    expect(hidden).not.toContain('公開手牌');
    expect(hidden).not.toContain(`data-table-hand="${view}"`);
    for (const wind of otherSeats) {
      expect(hidden).toContain(`data-table-hand="${wind}"`);
    }
    expect(hidden).toContain('w-[215px] h-[178px]');
    expect(hidden).not.toContain('opacity-40');
    // Revealing again restores the same table without modifying the deal.
    const publicAgain = render(true);
    expect(publicAgain).not.toContain('Back.svg');
    expect(publicAgain.match(/opacity-40/g)).toHaveLength(4);
    const rivers = (html: string) => html.slice(html.indexOf('data-river-wind='), html.indexOf('aria-label="ドラ表示牌"'));
    expect(rivers(hidden)).toBe(rivers(publicAgain));
  });

  it('keeps melds visible, preserves the drawn-tile gap, and follows indicator counts across kan and rewind', () => {
    const before = createSoloState(createDeck());
    const quad = before.seats.east.hand.filter(tile => tile.suit === 'man' && tile.value === 1);
    const after = applySoloAction(before, { type: 'kan', option: { type: 'ankan', tiles: quad, calledTile: quad[0] } })!;
    expect(after.doraCount).toBe(2);
    for (const state of [before, after, before]) {
      const html = renderToStaticMarkup(<FourPlayerTable state={soloPerspective(state, 'south')}
        publicSeats={state.seats} revealTiles={false} />);
      const indicators = html.slice(html.indexOf('aria-label="ドラ表示牌"'));
      expect(indicators.match(/alt="伏せ牌"/g)).toHaveLength(5 - state.doraCount);
      expect(indicators.match(/<img /g)).toHaveLength(5);
      expect(html).toMatch(/title="伏せ牌"[^>]*><img[^>]*alt="伏せ牌"/);
      expect(html).toContain('ml-2 shrink-0');
      if (state === after) {
        expect(html).toContain('data-meld-type="ankan"');
        expect(html.match(/alt="一萬"/g)).toHaveLength(4);
        const count = SEATS.filter(w => w !== 'south').reduce((n, w) => n + state.seats[w].hand.length + Number(!!state.seats[w].drawn), 0);
        expect(html.match(/alt="伏せ牌"/g)).toHaveLength(count + 3);
      }
    }
  });

  it.each([1, 2, 3, 4, 5])('shows exactly %i active indicators when other tiles are hidden', doraCount => {
    const state = createSoloState();
    state.doraCount = doraCount;
    const html = renderToStaticMarkup(<FourPlayerTable state={soloPerspective(state)} publicSeats={state.seats} revealTiles={false} />);
    const indicators = html.slice(html.indexOf('aria-label="ドラ表示牌"'));
    expect(indicators.match(/alt="伏せ牌"/g) ?? []).toHaveLength(5 - doraCount);
    expect(indicators.match(/<img /g)).toHaveLength(5);
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
