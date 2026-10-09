import type { HandAnalysis } from 'riichi-score';

interface RSYaku {
  name: string;
  han: number;
}

const YAKU_JP: Record<string, string> = {
  riichi: '立直',
  doubleRiichi: 'ダブル立直',
  ippatsu: '一発',
  menzenTsumo: '門前ツモ',
  tanyao: '断么九',
  pinfu: '平和',
  iipeikou: '一盃口',
  ryanpeikou: '二盃口',
  yakuhaiRoundWind: '場風',
  yakuhaiSeatWind: '自風',
  haku: '白',
  hatsu: '發',
  chun: '中',
  chankan: '槍槓',
  rinshanKaihou: '嶺上開花',
  haitei: '海底摸月',
  houtei: '河底撈魚',
  chiitoitsu: '七対子',
  chanta: '混全帯么九',
  junchan: '純全帯么九',
  toitoi: '対々和',
  sanankou: '三暗刻',
  sankantsu: '三槓子',
  sanshokuDoujun: '三色同順',
  sanshokuDoukou: '三色同刻',
  ittsu: '一気通貫',
  honroutou: '混老頭',
  shousangen: '小三元',
  honitsu: '混一色',
  chinitsu: '清一色',
  kokushiMusou: '国士無双',
  suuankou: '四暗刻',
  daisangen: '大三元',
  shousuushii: '小四喜',
  daisuushii: '大四喜',
  tsuuiisou: '字一色',
  chinroutou: '清老頭',
  ryuuiisou: '緑一色',
  chuurenPoutou: '九蓮宝燈',
  suukantsu: '四槓子',
  tenhou: '天和',
  chiihou: '地和',
};

function yakuName(yaku: RSYaku): string {
  return YAKU_JP[yaku.name] ?? yaku.name;
}

interface Props {
  result: HandAnalysis;
}

export default function YakuDisplay({ result }: Props) {
  const best = result.handInterpretations[0];

  if (!best) {
    return (
      <div className="text-yellow-200 text-sm text-center py-2">
        役の判定ができませんでした
      </div>
    );
  }

  const doraTotal = best.dora + best.akadora;

  return (
    <div className="flex flex-col gap-3 w-full max-w-sm">
      {/* Yaku list */}
      <div className="flex flex-col gap-1.5 bg-black/30 rounded-xl p-4">
        {best.yaku.map((yaku, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-yellow-100 font-semibold">{yakuName(yaku)}</span>
            <span className="text-yellow-300 font-bold">{yaku.han}飜</span>
          </div>
        ))}
        {best.dora > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-red-300 font-semibold">ドラ</span>
            <span className="text-red-400 font-bold">{best.dora}飜</span>
          </div>
        )}
        {best.akadora > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-red-300 font-semibold">赤ドラ</span>
            <span className="text-red-400 font-bold">{best.akadora}飜</span>
          </div>
        )}
        {best.uradora > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-red-300 font-semibold">裏ドラ</span>
            <span className="text-red-400 font-bold">{best.uradora}飜</span>
          </div>
        )}
      </div>

      {/* Summary: han, fu, points */}
      <div className="flex items-center justify-around gap-2 bg-black/30 rounded-xl p-3">
        <div className="flex flex-col items-center">
          <span className="text-yellow-200 text-[10px] font-bold tracking-wider">飜数</span>
          <span className="text-yellow-300 text-xl font-black">{best.han}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-yellow-200 text-[10px] font-bold tracking-wider">符</span>
          <span className="text-yellow-300 text-xl font-black">{best.fu}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-yellow-200 text-[10px] font-bold tracking-wider">獲得点数</span>
          <span className="text-yellow-300 text-xl font-black">{best.totalWinnings.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}
