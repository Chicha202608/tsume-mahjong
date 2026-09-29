import { Phase } from '@/types';

export default function StatusBar({ phase, wallCount, isViewingPast, tsumoAvailable }: { phase: Phase; wallCount: number; isViewingPast: boolean; tsumoAvailable: boolean }) {
  if (isViewingPast) {
    return <p className="text-sm text-center text-amber-300">牌譜閲覧中</p>;
  }
  if (tsumoAvailable) {
    return <p className="text-sm text-center text-yellow-300 animate-pulse">ツモ和了可能 — ツモ or キャンセル</p>;
  }
  const messages: Record<string, string> = {
    playerDraw: wallCount > 0 ? 'ツモ中...' : '山牌がなくなりました',
    playerDiscard: '手牌から1枚選んで捨ててください',
    cpuTurn: 'CPUが思考中...',
    naki: 'CPUの捨て牌に対してアクションを選んでください',
    playerNakiDiscard: '鳴いた牌を含めて1枚を捨ててください',
    win: 'あがり！',
    exhausted: '流局です',
  };

  const colors: Record<string, string> = {
    playerDraw: 'text-green-300',
    playerDiscard: 'text-amber-300',
    cpuTurn: 'text-blue-300',
    naki: 'text-red-300',
    playerNakiDiscard: 'text-blue-300',
    win: 'text-yellow-300',
    exhausted: 'text-gray-400',
  };

  return (
    <p className={`text-sm text-center ${colors[phase] ?? 'text-green-300'}`}>
      {messages[phase] ?? ''}
    </p>
  );
}
