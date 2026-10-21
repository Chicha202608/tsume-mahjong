import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import FourPlayerTable from '@/components/FourPlayerTable';
import ModeSelect from '@/components/ModeSelect';
import Header from '@/components/Header';
import WallModal from '@/components/WallModal';
import YakuDisplay from '@/components/YakuDisplay';
import { makeInitialState } from '@/game/gameState';
import { makeThreeNukiTestState } from '@/game/testScenarios';
import { applyPlayerDraw, applyNuki, applyDeclareTsumo } from '@/game/transitions';
import { isPlayerWallIndex } from '@/game/seatFlow';
import { scoreHand } from '@/game/scoreAdapter';

describe('three-player UI', () => {
  it('offers three-player mode with its rules on the home screen and menu', () => {
    const home = renderToStaticMarkup(<ModeSelect onSelect={() => {}} />);
    for (const name of ['二人モード','三人モード','四人モード','北抜き','ツモ損あり']) expect(home).toContain(name);
    const menu = renderToStaticMarkup(<Header mode="three" onAI={() => {}} onMode={() => {}} onHome={() => {}}
      onRestart={() => {}} turnCount={0} maxDraws={18} wallCount={55} isViewingPast={false} historyIndex={0} historyLength={1} />);
    expect(menu).toMatch(/aria-pressed="true"[^>]*>三人/);
    expect(menu).toContain('対局メニュー');
  });

  it.each(['east','south','west'] as const)('shows two hidden opponents and three rivers from %s', playerWind => {
    const state = makeInitialState('three'); state.playerWind = playerWind;
    const html = renderToStaticMarkup(<FourPlayerTable state={state} />);
    expect(html).toContain('data-three-table');
    expect(html.match(/data-table-hand=/g)).toHaveLength(2);
    expect(html.match(/data-river-wind=/g)).toHaveLength(3);
    expect(html.match(/alt="伏せ牌"/g)).toHaveLength(30); // 26 hands + 4 hidden indicators.
    expect(html).not.toContain('data-river-wind="north"');
    expect(html).not.toContain('公開手牌');
    expect(html).toContain('rotate(-90deg)'); expect(html).toContain('rotate(90deg)');
  });

  it('shows extracted north, its score bonus, and correct live-wall highlights after consecutive extraction', () => {
    const initial = makeThreeNukiTestState();
    const all = [...initial.playerHand, ...initial.opponents!.flatMap(p => p.hand), ...initial.wall, ...initial.wanpai];
    expect(new Set(all.map(t => t.id)).size).toBe(108);
    let state = applyPlayerDraw(initial)!;
    state = applyNuki(state, state.playerHand.find(t => t.suit === 'wind' && t.value === 4)!)!;
    state = applyNuki(state, state.playerDrawnTile!)!;
    const table = renderToStaticMarkup(<FourPlayerTable state={state} />);
    expect(table).toContain('抜き北 ×2');
    const wall = renderToStaticMarkup(<WallModal state={state} wall={state.wall} fullWall={state.fullWall}
      wallDrawnCount={state.wallDrawnCount} wanpai={state.wanpai} doraCount={state.doraCount}
      phase={state.phase} turnCount={state.turnCount} onClose={() => {}} />);
    const highlighted = [...wall.matchAll(/data-wall-tile="([^"]*)" data-highlighted="true"/g)].map(m => m[1]);
    expect(highlighted).toEqual(state.wall.filter((_, i) => isPlayerWallIndex(state, i)).map(t => t.id));
    for (const tile of [initial.wall[0], ...initial.wall.slice(-2)]) {
      expect(wall).toContain(`data-wall-tile="${tile.id}" data-highlighted="false"`);
    }
    const result = scoreHand(applyDeclareTsumo(state)!)!;
    expect(result.valid).toBe(true);
    const score = renderToStaticMarkup(<YakuDisplay result={result} />);
    expect(score).toContain('抜きドラ'); expect(score).not.toContain('嶺上開花');
  });
});
