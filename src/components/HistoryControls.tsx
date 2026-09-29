import { Undo, Undo2, Redo2 } from 'lucide-react';

interface Props {
  canUndo: boolean;
  canStepForward: boolean;
  onMatta: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
}

export default function HistoryControls({ canUndo, canStepForward, onMatta, onStepBack, onStepForward }: Props) {
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-2 bg-[#0f1f0f] border-b border-[#2d4a2d]">
      <button
        onClick={onMatta}
        disabled={!canUndo}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-orange-700 hover:bg-orange-600 active:scale-95 text-white text-sm font-bold transition-all shadow-md disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Undo size={14} />
        待った
      </button>
      <button
        onClick={onStepBack}
        disabled={!canUndo}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 active:scale-95 text-white text-sm font-bold transition-all shadow-md disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Undo2 size={14} />
        1手戻る
      </button>
      <button
        onClick={onStepForward}
        disabled={!canStepForward}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 active:scale-95 text-white text-sm font-bold transition-all shadow-md disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Redo2 size={14} />
        1手進む
      </button>
    </div>
  );
}
