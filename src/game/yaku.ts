import { Furo, Tile, Wind } from '@/types';

export type YakuId =
  | 'riichi'
  | 'menzenTsumo'
  | 'tanyao'
  | 'pinfu'
  | 'iipeikou'
  | 'yakuhai'
  | 'chiitoitsu'
  | 'honitsu'
  | 'chinitsu'
  | 'toitoi'
  | 'sanankou'
  | 'sanshoku'
  | 'ittsu'
  | 'chanta'
  | 'junchan'
  | 'honroutou'
  | 'shousangen';

export interface YakuResult {
  id: YakuId;
  name: string;
  han: number;
  openHan?: number;
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
