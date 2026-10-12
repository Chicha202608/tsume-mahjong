import type { HandAnalysis } from 'riichi-score';

interface RSYaku {
  name: string;
  han: number;
  limit?: string;
}

const YAKU_JP: Record<string, string> = {
  'riichi': '立直',
  'double-riichi': 'ダブル立直',
  'ippatsu': '一発',
  'menzen-tsumo': '門前清自摸和',
  'tanyao': '断么九',
  'pinfu': '平和',
  'iipeiko': '一盃口',
  'ryanpeikou': '二盃口',
  'round-wind': '場風',
  'seat-wind': '自風',
  'haku': '白',
  'hatsu': '發',
  'chun': '中',
  'chankan': '槍槓',
  'rinshan-kaihou': '嶺上開花',
  'haitei': '海底摸月',
  'houtei': '河底撈魚',
  'chiitoitsu': '七対子',
  'chanta': '混全帯么九',
  'junchan': '純全帯么九',
  'toitoi': '対々和',
  'sanankou': '三暗刻',
  'sankantsu': '三槓子',
  'sanshoku': '三色同順',
  'sanshoku-doukou': '三色同刻',
  'ittsuu': '一気通貫',
  'honroutou': '混老頭',
  'shousangen': '小三元',
  'honitsu': '混一色',
  'chinitsu': '清一色',
  'kokushi-musou': '国士無双',
  'suuankou': '四暗刻',
  'daisangen': '大三元',
  'shousuushii': '小四喜',
  'daisuushii': '大四喜',
  'tsuuiisou': '字一色',
  'chinroutou': '清老頭',
  'ryuuiisou': '緑一色',
  'chuuren-poutou': '九蓮宝燈',
  'suukantsu': '四槓子',
  'tenhou': '天和',
  'chiihou': '地和',
};

function yakuLabel(yaku: RSYaku): string {
  return YAKU_JP[yaku.name] ?? yaku.name;
}

function yakuHanLabel(yaku: RSYaku): string {
  if (yaku.limit) return yaku.limit;
  return `${yaku.han}飜`;
}

const YAKUMAN_LABELS: Record<string, string> = {
  'yakuman': '役満',
  'double-yakuman': 'ダブル役満',
  'triple-yakuman': 'トリプル役満',
  'quadruple-yakuman': '四倍役満',
};

function scoreTierLabel(best: NonNullable<HandAnalysis['handInterpretations'][number]>): string | null {
  if (best.limit) {
    return YAKUMAN_LABELS[best.limit] ?? '役満';
  }
  const bp = best.basicPoints;
  if (bp >= 6000) return '三倍満';
  if (bp >= 4000) return '倍満';
  if (bp >= 3000) return '跳満';
  if (bp >= 2000) return '満貫';
  return null;
}

interface Props {
  result: HandAnalysis;
}

export default function YakuDisplay({ result }: Props) {
  const best = result.handInterpretations[0];

  if (!best) {
    return (
      <div className="text-white text-sm text-center py-2">
        役の判定ができませんでした
      </div>
    );
  }

  const tierLabel = scoreTierLabel(best);

  return (
    <div className="flex flex-col gap-3 w-full max-w-2xl">
      {/* Yaku list */}
      <div className="flex flex-col gap-1.5 bg-black/30 rounded-xl p-4">
        {best.yaku.map((yaku, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-white font-semibold">{yakuLabel(yaku)}</span>
            <span className="text-white font-bold">{yakuHanLabel(yaku)}</span>
          </div>
        ))}
        {best.dora > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-white font-semibold">ドラ</span>
            <span className="text-white font-bold">{best.dora}飜</span>
          </div>
        )}
        {best.akadora > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-white font-semibold">赤ドラ</span>
            <span className="text-white font-bold">{best.akadora}飜</span>
          </div>
        )}
        {best.uradora > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-white font-semibold">裏ドラ</span>
            <span className="text-white font-bold">{best.uradora}飜</span>
          </div>
        )}
      </div>

      {/* Summary: tier, fu, han, points */}
      <div className="grid grid-cols-[1.4fr_0.65fr_0.65fr_1.4fr] items-center gap-1 bg-black/30 rounded-xl p-3 w-full">
        <div className="flex min-w-0 flex-col items-center">
          <span className="text-red-500 text-3xl sm:text-4xl font-[1200] whitespace-nowrap" style={{ textShadow: '0 0 1px currentColor, 0 0 1px currentColor' }}>{tierLabel ?? ''}</span>
        </div>
        <div className="flex min-w-0 flex-col items-center">
          <span className="text-white text-[10px] font-bold tracking-wider">符数</span>
          <span className="text-white text-lg font-black tabular-nums">{best.fu}</span>
        </div>
        <div className="flex min-w-0 flex-col items-center">
          <span className="text-white text-[10px] font-bold tracking-wider">飜数</span>
          <span className="text-white text-lg font-black tabular-nums">{best.han}</span>
        </div>
        <div className="flex min-w-0 flex-col items-center">
          <span className="text-white text-[10px] font-bold tracking-wider">点数</span>
          <span className="text-white text-3xl sm:text-4xl font-black tabular-nums whitespace-nowrap">{best.totalWinnings.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}
