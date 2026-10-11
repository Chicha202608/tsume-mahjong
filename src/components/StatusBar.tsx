import { Phase } from '@/types';

export default function StatusBar({ phase, wallCount, isViewingPast, tsumoAvailable }: { phase: Phase; wallCount: number; isViewingPast: boolean; tsumoAvailable: boolean }) {
  if (isViewingPast) return null;
  if (tsumoAvailable) return null;
  const messages: Record<string, string> = {
    playerDraw: wallCount > 0 ? 'ツモ中...' : '山牌がなくなりました',
    cpuTurn: 'CPUが思考中...',
    win: 'あがり！',
    exhausted: '流局です',
  };

  const colors: Record<string, string> = {
    playerDraw: 'text-green-300',
    cpuTurn: 'text-blue-300',
    win: 'text-yellow-300',
    exhausted: 'text-gray-400',
  };

  if (!messages[phase]) return null;

  return (
    <p className={`text-sm text-center ${colors[phase] ?? 'text-green-300'}`}>
      {messages[phase]}
    </p>
  );
}
