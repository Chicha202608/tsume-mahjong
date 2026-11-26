import { useEffect, useId, useRef, useState } from 'react';
import DailyRankingTable from '@/components/DailyRankingTable';
import type { DailyRankingBoard } from '@/game/dailyRankingTypes';

export default function DailyRankingDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [board, setBoard] = useState<DailyRankingBoard | 'loading' | 'error'>('loading');

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch('/api/daily-ranking?view=board', { signal: controller.signal });
        if (!response.ok) throw new Error('Ranking unavailable');
        const data: DailyRankingBoard = await response.json();
        if (!controller.signal.aborted) setBoard(data);
      } catch {
        if (!controller.signal.aborted) setBoard('error');
      }
    })();
    return () => controller.abort();
  }, [open, attempt]);

  return (
    <>
      <button type="button" aria-haspopup="dialog" onClick={() => {
        setBoard('loading');
        dialog.current?.showModal();
        setOpen(true);
      }} className="rounded-lg px-3 py-2 text-sm font-medium text-emerald-200 underline underline-offset-4 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400">
        今日のランキング
      </button>
      <dialog ref={dialog} aria-labelledby={titleId} onClose={() => setOpen(false)}
        className="m-auto w-[min(92vw,32rem)] max-h-[90dvh] overflow-y-auto rounded-2xl border border-emerald-700 bg-[#10261c] p-5 text-white backdrop:bg-black/70">
        <h2 id={titleId} className="text-xl font-bold">今日のランキング</h2>
        {board === 'loading' && <p role="status" className="mt-3 text-sm text-emerald-200">読み込み中…</p>}
        {board === 'error' && <div className="mt-3">
          <p role="alert" className="text-sm text-red-200">ランキングを読み込めませんでした。</p>
          <button type="button" onClick={() => {
            setBoard('loading');
            setAttempt(value => value + 1);
          }} className="mt-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm hover:bg-emerald-600">再試行</button>
        </div>}
        {typeof board === 'object' && <>
          <p className="my-3 text-sm text-emerald-200"><time dateTime={board.date}>{board.date}</time> · {board.participants.toLocaleString('ja-JP')} 人</p>
          {board.rows.length > 0 ? <DailyRankingTable rows={board.rows} /> : <p className="text-sm">今日の結果はまだありません。</p>}
        </>}
        <div className="mt-5 flex justify-end">
          <button type="button" onClick={() => dialog.current?.close()}
            className="rounded-lg border border-emerald-700 px-4 py-2 text-sm hover:bg-emerald-900">閉じる</button>
        </div>
      </dialog>
    </>
  );
}
