import { maxRankingNameLength } from '@/game/dailyRankingTypes';
import type { useDailyRanking } from '@/game/useDailyRanking';
import DailyRankingTable from '@/components/DailyRankingTable';

export default function DailyRankingPanel({ ranking }: { ranking: ReturnType<typeof useDailyRanking> }) {
  const { result, busy, error, closed, nameSaved, retry, saveName } = ranking;
  const rows = result && (result.rows.some(row => row.isYou) ? result.rows : [...result.rows, result.yours]);

  return (
    <section aria-label="今日のランキング" className="w-full rounded-xl border border-emerald-800 bg-[#10261c] px-4 py-3 text-white">
      <h3 className="font-bold">今日のランキング</h3>
      {result && rows && <>
        <p className="my-1 text-sm text-emerald-200">あなたは {result.yours.rank.toLocaleString('ja-JP')} 位 / {result.participants.toLocaleString('ja-JP')} 人</p>
        <div className="my-2 max-h-32 overflow-y-auto">
          <DailyRankingTable rows={rows} />
        </div>
        {!closed && <form onSubmit={event => {
          event.preventDefault();
          const name = new FormData(event.currentTarget).get('nickname');
          if (typeof name === 'string') saveName(name);
        }} className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex flex-1 flex-wrap items-center gap-2">
            名前（任意・公開）
            <input name="nickname" defaultValue={result.yours.name === '名無し' ? '' : result.yours.name}
              placeholder="名無し" maxLength={maxRankingNameLength} autoComplete="off" disabled={busy}
              className="min-w-24 flex-1 rounded border border-emerald-700 bg-[#071b12] px-2 py-1 text-white" />
          </label>
          <button disabled={busy} className="rounded bg-emerald-700 px-3 py-1 font-bold hover:bg-emerald-600 disabled:opacity-50">名前を保存</button>
        </form>}
      </>}
      {busy && <p role="status" className="mt-2 text-sm text-emerald-200">保存中…</p>}
      {nameSaved && <p role="status" className="mt-2 text-sm text-emerald-200">名前を保存しました。</p>}
      {error && <p role="alert" className="mt-2 text-sm text-red-200">{error}</p>}
      {!result && error && !closed && <button disabled={busy} onClick={retry} className="mt-2 rounded bg-emerald-700 px-3 py-1 text-sm">再試行</button>}
    </section>
  );
}
