export type ImportTaskStatus = "pending" | "processing" | "success" | "failed" | "cancelled";

export type ChangeType = "new" | "lost" | "up" | "down" | "flat";

export type RankRange = "top100" | "top1000" | "top10000" | "top50000" | "gt50000" | "all";

export type OpportunityType = "new_opportunity" | "burst" | "rising" | "high_potential" | "stable_core";

export type AlertType =
  | "drop_top100"
  | "drop_top1000"
  | "continuous_down"
  | "lost"
  | "large_fluctuation"
  | "favorite_down";

export type AlertLevel = "high" | "medium" | "low";

export interface KeywordDaily {
  keyword: string;
  rank: number;
  reportDate: string;
}

export interface KeywordProfile {
  keyword: string;
  firstSeenDate?: string;
  lastSeenDate?: string;
  bestRank?: number;
  worstRank?: number;
  tag?: string;
  note?: string;
  isFavorite?: boolean;
}

export interface KeywordComparison {
  keyword: string;
  currentRank: number | null;
  compareRank: number | null;
  changeValue: number | null;
  changeType: ChangeType;
  bestRank?: number;
  worstRank?: number;
  firstSeenDate?: string;
  lastSeenDate?: string;
  streakDays?: number;
  tag?: string;
  isFavorite?: boolean;
}

export interface DashboardSummary {
  totalKeywords: number;
  newKeywords: number;
  lostKeywords: number;
  upKeywords: number;
  downKeywords: number;
  top100: number;
  top1000: number;
  top10000: number;
}

export interface DistributionPoint {
  name: string;
  value: number;
}

export interface TrendPoint {
  date: string;
  totalKeywords: number;
  newKeywords: number;
  lostKeywords: number;
  upKeywords: number;
  downKeywords: number;
}

export interface OpportunityRow {
  keyword: string;
  rank: number;
  sevenDayChange: number | null;
  thirtyDayChange: number | null;
  type: OpportunityType;
  score: number;
  suggestion: string;
}

export interface AlertRow {
  keyword: string;
  type: AlertType;
  level: AlertLevel;
  currentRank: number | null;
  compareRank: number | null;
  changeValue: number | null;
  alertDate: string;
  status: "unhandled" | "handled";
}

export interface ImportTask {
  taskId: number;
  fileName: string;
  reportDate: string;
  totalRows: number;
  processedRows: number;
  successRows: number;
  failedRows: number;
  duplicateRows: number;
  status: ImportTaskStatus;
  errorMessage?: string;
  createdAt?: string;
  finishedAt?: string;
}
