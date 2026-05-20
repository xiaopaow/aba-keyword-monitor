import type { AlertRow, DistributionPoint, ImportTask, KeywordComparison, KeywordDaily, OpportunityRow, TrendPoint } from "./types.js";
import { buildRankDistribution, compareKeywordSets, detectAlerts, detectOpportunity, summarizeDashboard } from "./analytics.js";

export const currentDate = "2026-05-20";
export const compareDate = "2026-05-19";

const keywords = [
  "wireless earbuds",
  "bluetooth speaker",
  "phone case",
  "charging cable",
  "screen protector",
  "phone stand",
  "smart watch band",
  "fitness tracker",
  "old phone case",
  "discontinued item",
  "portable charger",
  "tablet holder"
];

export const mockCurrentRows: KeywordDaily[] = keywords.slice(0, 10).map((keyword, index) => ({
  keyword,
  rank: [256, 1789, 89, 3456, 567, 12345, 2345, 1234, 15678, 23456][index],
  reportDate: currentDate
}));

export const mockCompareRows: KeywordDaily[] = keywords.slice(0, 8).concat(keywords.slice(10)).map((keyword, index) => ({
  keyword,
  rank: [1256, 567, 234, 2123, 678, 8765, 3456, 2345, 45000, 12999][index],
  reportDate: compareDate
}));

export const mockProfiles = keywords.map((keyword, index) => ({
  keyword,
  firstSeenDate: index < 2 ? currentDate : "2026-04-20",
  lastSeenDate: index > 9 ? compareDate : currentDate,
  bestRank: Math.max(1, (mockCurrentRows.find((row) => row.keyword === keyword)?.rank ?? 1000) - 200),
  worstRank: (mockCompareRows.find((row) => row.keyword === keyword)?.rank ?? 20000) + 500,
  tag: ["核心词", "产品词", "长尾词", "竞品词", "品牌词"][index % 5],
  isFavorite: index % 4 === 0
}));

export const mockKeywordRows: KeywordComparison[] = compareKeywordSets(mockCurrentRows, mockCompareRows, mockProfiles);

export const mockDashboard = {
  ...summarizeDashboard(mockCurrentRows, mockCompareRows),
  distribution: buildRankDistribution(mockCurrentRows) satisfies DistributionPoint[]
};

export const mockTrend: TrendPoint[] = Array.from({ length: 30 }, (_, index) => {
  const day = String(index + 1).padStart(2, "0");
  return {
    date: `05-${day}`,
    totalKeywords: 2200000 + index * 18000,
    newKeywords: 35000 + (index % 6) * 1200,
    lostKeywords: 26000 + (index % 5) * 900,
    upKeywords: 110000 + index * 2200,
    downKeywords: 102000 + index * 1700
  };
});

export const mockOpportunities: OpportunityRow[] = [
  ...detectOpportunity({
    keyword: "wireless earbuds",
    currentRank: 256,
    firstSeenDate: currentDate,
    currentDate,
    sevenDayRank: 5878,
    thirtyDayRank: 12256,
    recentRanks: [5878, 4200, 3500, 2400, 1256, 899, 256]
  }),
  ...detectOpportunity({
    keyword: "smart watch band",
    currentRank: 2345,
    firstSeenDate: "2026-04-20",
    currentDate,
    sevenDayRank: 8023,
    thirtyDayRank: 22000,
    recentRanks: [8023, 7300, 6200, 5200, 4100, 3300, 2345]
  }),
  ...detectOpportunity({
    keyword: "screen protector",
    currentRank: 567,
    firstSeenDate: "2026-04-20",
    currentDate,
    sevenDayRank: 840,
    thirtyDayRank: 950,
    recentRanks: Array.from({ length: 30 }, (_, index) => 900 - index * 11)
  })
];

export const mockAlerts: AlertRow[] = [
  ...detectAlerts({
    keyword: "bluetooth speaker",
    currentRank: 1789,
    compareRank: 567,
    recentRanks: [430, 567, 1789],
    alertDate: currentDate,
    isFavorite: true
  }),
  ...detectAlerts({
    keyword: "old phone case",
    currentRank: 15678,
    compareRank: 45000,
    recentRanks: [18000, 12000, 15678],
    alertDate: currentDate
  }),
  ...detectAlerts({
    keyword: "portable charger",
    currentRank: null,
    compareRank: 45000,
    recentRanks: [32000, 36000, null],
    alertDate: currentDate
  })
];

export const mockImportTask: ImportTask = {
  taskId: 1,
  fileName: "aba_2026_05_20.csv",
  reportDate: currentDate,
  totalRows: 2703405,
  processedRows: 2180000,
  successRows: 2169200,
  failedRows: 300,
  duplicateRows: 10500,
  status: "processing",
  createdAt: "2026-05-20T15:42:50Z"
};
