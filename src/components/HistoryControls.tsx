import { Undo, Undo2, Redo2, SkipBack, SkipForward } from 'lucide-react';

interface Props {
  canUndo: boolean;
  canStepBack: boolean;
  canStepForward: boolean;
  onMatta: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onFirst: () => void;
  onLast: () => void;
}

export default function HistoryControls({ canUndo, canStepBack, canStepForward, onMatta, onStepBack, onStepForward, onFirst, onLast }: Props) {
  return (
    <div className="flex items-center justify-center gap-1 px-2 py-1 bg-[#0f1f0f] border-b border-[#2d4a2d] rounded-md shrink-0">
      <button
        onClick={onMatta}
        disabled={!canUndo}
        className="flex items-center gap-1 px-2 py-1 rounded-md bg-orange-700 hover:bg-orange-600 active:scale-95 text-white text-xs font-bold transition-all shadow-md disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
      >
        <Undo size={12} />
        待った
      </button>
      <button
        onClick={onFirst}
        disabled={!canStepBack}
        title="履歴の最初へ"
        className="flex items-center gap-1 px-2 py-1 rounded-md bg-gray-700 hover:bg-gray-600 active:scale-95 text-white text-xs font-bold transition-all shadow-md disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
      >
        <SkipBack size={12} />
        最初
      </button>
      <button
        onClick={onStepBack}
        disabled={!canStepBack}
        className="flex items-center gap-1 px-2 py-1 rounded-md bg-gray-700 hover:bg-gray-600 active:scale-95 text-white text-xs font-bold transition-all shadow-md disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
      >
        <Undo2 size={12} />
        戻る
      </button>
      <button
        onClick={onStepForward}
        disabled={!canStepForward}
        className="flex items-center gap-1 px-2 py-1 rounded-md bg-gray-700 hover:bg-gray-600 active:scale-95 text-white text-xs font-bold transition-all shadow-md disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
      >
        <Redo2 size={12} />
        進む
      </button>
      <button
        onClick={onLast}
        disabled={!canStepForward}
        title="履歴の最後へ"
        className="flex items-center gap-1 px-2 py-1 rounded-md bg-gray-700 hover:bg-gray-600 active:scale-95 text-white text-xs font-bold transition-all shadow-md disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
      >
        <SkipForward size={12} />
        最後
      </button>
    </div>
  );
}
