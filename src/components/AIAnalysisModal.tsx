import { createPortal } from 'react-dom';
import ReplayFit from '@/components/ReplayFit';

export default function AIAnalysisModal({ summary, canReplay, onReplay, onClose }: {
  summary: string; canReplay: boolean; onReplay: () => void; onClose: () => void;
}) {
  return createPortal(<div className="fixed inset-0 z-[65] bg-black/70 p-4">
    <ReplayFit width={520}>
      <div role="dialog" aria-label="AI" className="p-7 rounded-xl bg-[#102b20] border border-emerald-700 text-white">
        <div className="flex justify-between items-center mb-8"><h2 className="text-xl font-bold">AI</h2>
          <button onClick={onClose} className="px-3 py-1 rounded bg-gray-700">閉じる</button></div>
        <p className="text-xl text-amber-200 mb-8">{summary}</p>
        <button disabled={!canReplay} onClick={onReplay} className="px-5 py-2 rounded bg-emerald-700 disabled:opacity-40">AIの手順</button>
      </div>
    </ReplayFit>
  </div>, document.body);
}
