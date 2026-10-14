import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import NakiRonButtons from '@/components/NakiRonButtons';
import type { Tile } from '@/types';

const discard: Tile = { id: '4p', suit: 'pin', value: 4 };

describe('ron control rendering', () => {
  it('shows read-only replay choices and highlights the AI cancellation', () => {
    const html = renderToStaticMarkup(createElement(NakiRonButtons, {
      phase: 'naki', lastCpuDiscard: discard, ronAvailable: true,
      nakiOptions: [{ type: 'pung', tiles: [
        { ...discard, id: 'held-1' }, { ...discard, id: 'held-2' },
      ], calledTile: discard }],
      readOnly: true, replayChoice: 'pass',
      onRon: vi.fn(), onNaki: vi.fn(), onDeclareKan: vi.fn(), onPassNaki: vi.fn(),
    }));
    const buttons = html.match(/<button[^>]*>[\s\S]*?<\/button>/g) ?? [];
    expect(buttons).toHaveLength(3);
    expect(buttons.every(button => button.includes('disabled=""'))).toBe(true);
    expect(buttons.find(button => button.includes('キャンセル'))).toContain('ring-yellow-400');
    expect(html).toContain('ポン');
    expect(html).toContain('ロン');
  });

  it('shows a clickable ron button when the engine reports a legal ron', () => {
    const html = renderToStaticMarkup(createElement(NakiRonButtons, {
      phase: 'naki',
      lastCpuDiscard: discard,
      ronAvailable: true,
      nakiOptions: [],
      onRon: vi.fn(),
      onNaki: vi.fn(),
      onDeclareKan: vi.fn(),
      onPassNaki: vi.fn(),
    }));
    expect(html).toContain('ロン');
    expect(html).toContain('キャンセル');
  });

  it('does not show ron when furiten or yaku checks reject it', () => {
    const html = renderToStaticMarkup(createElement(NakiRonButtons, {
      phase: 'naki',
      lastCpuDiscard: discard,
      ronAvailable: false,
      nakiOptions: [],
      onRon: vi.fn(),
      onNaki: vi.fn(),
      onDeclareKan: vi.fn(),
      onPassNaki: vi.fn(),
    }));
    expect(html).not.toContain('ロン');
  });
});
