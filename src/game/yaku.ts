import { Furo, Tile, Wind } from '@/types';

export type YakuId =
  // 1 han
  | 'riichi'
  | 'ippatsu'
  | 'menzenTsumo'
  | 'tanyao'
  | 'pinfu'
  | 'iipeikou'
  | 'yakuhaiRoundWind'
  | 'yakuhaiSeatWind'
  | 'yakuhaiHaku'
  | 'yakuhaiHatsu'
  | 'yakuhaiChun'
  | 'chankan'
  | 'rinshanKaihou'
  | 'haitei'
  | 'houtei'
  // 2 han
  | 'doubleRiichi'
  | 'chiitoitsu'
  | 'chanta'
  | 'toitoi'
  | 'sanankou'
  | 'sankantsu'
  | 'sanshokuDoujun'
  | 'sanshokuDoukou'
  | 'ittsu'
  | 'honroutou'
  | 'shousangen'
  | 'honitsu'
  // 3 han
  | 'junchan'
  | 'ryanpeikou'
  // 6 han
  | 'chinitsu'
  // Yakuman
  | 'kokushiMusou'
  | 'suuankou'
  | 'daisangen'
  | 'shousuushii'
  | 'daisuushii'
  | 'tsuuiisou'
  | 'chinroutou'
  | 'ryuuiisou'
  | 'chuurenPoutou'
  | 'suukantsu'
  | 'tenhou'
  | 'chiihou';

export interface YakuResult {
  id: YakuId;
  name: string;
  han: number;
}

export interface YakuContext {
  hand: Tile[];
  furo: Furo[];
  roundWind: Wind;
  playerWind: Wind;
  isTsumo: boolean;
  isRiichi: boolean;
}

export type YakuDetector = (context: YakuContext) => YakuResult | null;

export function getYaku(context: YakuContext): YakuResult[] {
  const results: YakuResult[] = [];
  return results;
}

export function getTotalHan(yaku: YakuResult[]): number {
  return yaku.reduce((total, item) => total + item.han, 0);
}
