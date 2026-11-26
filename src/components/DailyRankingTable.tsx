import type { DailyRankingRow } from '@/game/dailyRankingTypes';

export default function DailyRankingTable({ rows }: { rows: readonly DailyRankingRow[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-[#10261c] text-emerald-200">
        <tr><th scope="col" className="px-2 py-1 text-left">順位</th><th scope="col" className="px-2 py-1 text-left">名前</th><th scope="col" className="px-2 py-1 text-right">得点</th></tr>
      </thead>
      <tbody>
        {rows.map(row => <tr key={row.id} className={row.isYou ? 'bg-emerald-900 font-bold' : ''}>
          <td className="px-2 py-1 tabular-nums">{row.rank.toLocaleString('ja-JP')}</td>
          <td className="px-2 py-1 break-all"><bdi>{row.name}</bdi>{row.isYou && <span className="ml-1 text-emerald-200">（あなた）</span>}</td>
          <td className="px-2 py-1 text-right whitespace-nowrap tabular-nums">{row.score.toLocaleString('ja-JP')} 点</td>
        </tr>)}
      </tbody>
    </table>
  );
}
