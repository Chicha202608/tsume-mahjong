import { Bug } from 'lucide-react';

interface Props {
  onSetupTest: (mode: 'ankan' | 'kakan' | 'daiminkan') => void;
}

export default function DebugButtons({ onSetupTest }: Props) {
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-1.5 bg-[#0a1a0a] border-b border-[#2d4a2d]">
      <span className="text-gray-500 text-xs font-semibold flex items-center gap-1">
        <Bug size={12} />
        テスト:
      </span>
      <button
        onClick={() => onSetupTest('ankan')}
        className="px-3 py-1 rounded-md bg-gray-800 hover:bg-gray-700 active:scale-95 text-gray-300 text-xs font-medium transition-all"
      >
        暗カン準備
      </button>
      <button
        onClick={() => onSetupTest('kakan')}
        className="px-3 py-1 rounded-md bg-gray-800 hover:bg-gray-700 active:scale-95 text-gray-300 text-xs font-medium transition-all"
      >
        加槓準備
      </button>
      <button
        onClick={() => onSetupTest('daiminkan')}
        className="px-3 py-1 rounded-md bg-gray-800 hover:bg-gray-700 active:scale-95 text-gray-300 text-xs font-medium transition-all"
      >
        大明槓準備
      </button>
    </div>
  );
}
