import { useState } from 'react';
import { Bug } from 'lucide-react';
import type { TestMode } from '@/game/testScenarios';

export default function DebugButtons({ onSetupTest, vertical = false }: { onSetupTest: (mode: TestMode) => void; vertical?: boolean }) {
  const [mode, setMode] = useState<TestMode>('two-ankan');
  return <div className={vertical ? "flex flex-col items-stretch gap-3" : "flex items-center gap-2 ml-2"}>
    <label className="flex items-center gap-1 text-gray-400 text-xs" htmlFor="test-scenario">
      <Bug size={12} />テスト
    </label>
    <select id="test-scenario" aria-label="テスト局面" value={mode}
      onChange={event => setMode(event.target.value as TestMode)}
      className={`${vertical ? 'w-full' : 'w-40'} rounded-md bg-gray-800 px-2 py-2 text-xs text-gray-200 border border-gray-600`}>
      <optgroup label="副露の探索">
        <option value="four-pon-kakan">4ポン＋4加槓（四槓子）</option>
        <option value="three-open-haneman">副露3回で跳満（12,000点）</option>
        <option value="two-open-haneman">副露2回で跳満（12,000点）</option>
        <option value="open-pon-haneman">ポンで跳満（12,000点）</option>
        <option value="open-chi-haneman">チーで跳満（12,000点）</option>
      </optgroup>
      <optgroup label="暗槓の探索">
        <option value="two-ankan">暗槓2回（通常ツモ）</option>
        <option value="chained-ankan">暗槓2回（嶺上から連続）</option>
      </optgroup>
      <optgroup label="カンの動作">
        <option value="ankan">暗カン準備</option>
        <option value="riichi-ankan">立直暗カン準備</option>
        <option value="kakan">加槓準備</option>
        <option value="daiminkan">大明槓準備</option>
      </optgroup>
      <optgroup label="和了の動作">
        <option value="open-ittsu-ron">一通ロン準備</option>
        <option value="open-ittsu-tsumo">一通ツモ準備</option>
      </optgroup>
    </select>
    <button onClick={() => onSetupTest(mode)}
      className="px-3 py-1 rounded-md bg-gray-800 hover:bg-gray-700 active:scale-95 text-gray-200 text-xs font-medium transition-all">
      準備
    </button>
  </div>;
}
