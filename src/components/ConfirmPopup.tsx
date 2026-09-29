interface Props {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmPopup({ message, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60]">
      <div className="bg-[#1e2a1e] border border-amber-500 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl flex flex-col items-center gap-4">
        <h2 className="text-amber-300 font-bold text-lg text-center">確認</h2>
        <p className="text-green-200 text-sm text-center">
          {message}
        </p>
        <div className="flex gap-3 mt-2">
          <button
            onClick={onConfirm}
            className="px-6 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 active:scale-95 text-white font-bold text-sm transition-all shadow-md"
          >
            OK
          </button>
          <button
            onClick={onCancel}
            className="px-6 py-2.5 rounded-lg bg-gray-600 hover:bg-gray-500 active:scale-95 text-white font-bold text-sm transition-all shadow-md"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
