import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import HistoryControls from '@/components/HistoryControls';

function buttons(canStepBack: boolean, canStepForward: boolean, canUndo = false) {
  const noop = () => {};
  const html = renderToStaticMarkup(<HistoryControls
    canUndo={canUndo} canStepBack={canStepBack} canStepForward={canStepForward}
    onMatta={noop} onStepBack={noop} onStepForward={noop} onFirst={noop} onLast={noop}
  />);
  return [...html.matchAll(/<button\b([^>]*)>(.*?)<\/button>/g)].map(([, attributes, body]) => ({
    label: body.replace(/<[^>]*>/g, ''), disabled: /\sdisabled=""/.test(attributes),
  }));
}

describe('history controls', () => {
  it('shows all five controls in order and disables navigation for a single record', () => {
    const result = buttons(false, false);
    expect(result.map(b => b.label)).toEqual(['待った', '最初', '戻る', '進む', '最後']);
    expect(result.every(b => b.disabled)).toBe(true);
  });

  it('allows returning to the first record even when undo is unavailable', () => {
    expect(buttons(true, true).map(b => b.disabled)).toEqual([true, false, false, false, false]);
  });

  it('disables the appropriate direction at each endpoint', () => {
    expect(buttons(false, true).map(b => b.disabled)).toEqual([true, true, true, false, false]);
    expect(buttons(true, false, true).map(b => b.disabled)).toEqual([false, false, false, true, true]);
  });
});
