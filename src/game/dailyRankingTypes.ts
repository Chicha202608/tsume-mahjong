export const maxRankingNameLength = 20;

export interface DailyRankingRow {
  id: string;
  rank: number;
  name: string;
  score: number;
  isYou: boolean;
}

export interface DailyRanking {
  rows: DailyRankingRow[];
  yours: DailyRankingRow;
  participants: number;
}
