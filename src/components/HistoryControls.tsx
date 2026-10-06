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
    <div className="flex items-center justify-center gap-1 px-2 py-1 bg-[#0f1f0f] border-b border-[#2d4a2d] rounded-md">
      <button
        onClick={onMatta}
        disabled={!canUndo}
        className="flex items-center gap-1 px-2 py-1 rounded-md bg-orange-700 hover:bg-orange-600 active:scale-95 text-white text-xs font-bold transition-all shadow-md disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Undo size={12} />
        待った
      </button>
      <button
        onClick={onStepBack}
        disabled={!canUndo}
        className="flex items-center gap-1 px-2 py-1 rounded-md bg-gray-700 hover:bg-gray-600 active:scale-95 text-white text-xs font-bold transition-all shadow-md disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Undo2 size={12} />
        戻る
      </button>
      <button
        onClick={onStepForward}
        disabled={!canStepForward}
        className="flex items-center gap-1 px-2 py-1 rounded-md bg-gray-700 hover:bg-gray-600 active:scale-95 text-white text-xs font-bold transition-all shadow-md disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Redo2 size={12} />
        進む
      </button>
    </div>
  );
}
