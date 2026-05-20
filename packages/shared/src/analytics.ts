import type {
  AlertLevel,
  AlertRow,
  AlertType,
  ChangeType,
  DashboardSummary,
  DistributionPoint,
  KeywordComparison,
  KeywordDaily,
  KeywordProfile,
  OpportunityRow,
  OpportunityType,
  RankRange
} from "./types.js";

export function getChangeType(currentRank: number | null, compareRank: number | null): ChangeType {
  if (currentRank !== null && compareRank === null) return "new";
  if (currentRank === null && compareRank !== null) return "lost";
  if (currentRank === null || compareRank === null) return "flat";
  if (currentRank < compareRank) return "up";
  if (currentRank > compareRank) return "down";
  return "flat";
}

export function getChangeValue(currentRank: number | null, compareRank: number | null): number | null {
  if (currentRank === null || compareRank === null) return null;
  return compareRank - currentRank;
}

export function inRankRange(rank: number | null, range: RankRange): boolean {
  if (range === "all") return true;
  if (rank === null) return range === "gt50000";
  if (range === "top100") return rank <= 100;
  if (range === "top1000") return rank <= 1000;
  if (range === "top10000") return rank <= 10000;
  if (range === "top50000") return rank <= 50000;
  return rank > 50000;
}

export function compareKeywordSets(
  currentRows: KeywordDaily[],
  compareRows: KeywordDaily[],
  profiles: KeywordProfile[] = []
): KeywordComparison[] {
  const current = new Map(currentRows.map((row) => [row.keyword, row.rank]));
  const compare = new Map(compareRows.map((row) => [row.keyword, row.rank]));
  const profileMap = new Map(profiles.map((profile) => [profile.keyword, profile]));
  const keywords = new Set([...current.keys(), ...compare.keys()]);

  return [...keywords].sort().map((keyword) => {
    const currentRank = current.get(keyword) ?? null;
    const compareRank = compare.get(keyword) ?? null;
    const profile = profileMap.get(keyword);
    return {
      keyword,
      currentRank,
      compareRank,
      changeValue: getChangeValue(currentRank, compareRank),
      changeType: getChangeType(currentRank, compareRank),
      bestRank: profile?.bestRank,
      worstRank: profile?.worstRank,
      firstSeenDate: profile?.firstSeenDate,
      lastSeenDate: profile?.lastSeenDate,
      tag: profile?.tag,
      isFavorite: profile?.isFavorite
    };
  });
}

export function summarizeDashboard(currentRows: KeywordDaily[], compareRows: KeywordDaily[]): DashboardSummary {
  const rows = compareKeywordSets(currentRows, compareRows);
  return {
    totalKeywords: new Set(currentRows.map((row) => row.keyword)).size,
    newKeywords: rows.filter((row) => row.changeType === "new").length,
    lostKeywords: rows.filter((row) => row.changeType === "lost").length,
    upKeywords: rows.filter((row) => row.changeType === "up").length,
    downKeywords: rows.filter((row) => row.changeType === "down").length,
    top100: currentRows.filter((row) => row.rank <= 100).length,
    top1000: currentRows.filter((row) => row.rank <= 1000).length,
    top10000: currentRows.filter((row) => row.rank <= 10000).length
  };
}

export function buildRankDistribution(currentRows: KeywordDaily[]): DistributionPoint[] {
  const distribution = [
    { name: "Top100", value: 0 },
    { name: "Top101-1000", value: 0 },
    { name: "Top1001-10000", value: 0 },
    { name: "Top10001-50000", value: 0 },
    { name: "50000+", value: 0 }
  ];

  for (const row of currentRows) {
    if (row.rank <= 100) distribution[0].value += 1;
    else if (row.rank <= 1000) distribution[1].value += 1;
    else if (row.rank <= 10000) distribution[2].value += 1;
    else if (row.rank <= 50000) distribution[3].value += 1;
    else distribution[4].value += 1;
  }

  return distribution;
}

export function isConsecutiveRising(ranks: Array<number | null>, days: number): boolean {
  const recent = ranks.slice(-days).filter((rank): rank is number => rank !== null);
  if (recent.length < days) return false;
  for (let index = 1; index < recent.length; index += 1) {
    if (recent[index] >= recent[index - 1]) return false;
  }
  return true;
}

export function isConsecutiveFalling(ranks: Array<number | null>, days: number): boolean {
  const recent = ranks.slice(-days).filter((rank): rank is number => rank !== null);
  if (recent.length < days) return false;
  for (let index = 1; index < recent.length; index += 1) {
    if (recent[index] <= recent[index - 1]) return false;
  }
  return true;
}

export function scoreOpportunity(input: {
  currentRank: number;
  sevenDayChange: number | null;
  thirtyDayChange: number | null;
  appearedSevenDays: boolean;
  roseSevenDays: boolean;
}): number {
  let score = 0;
  if (input.currentRank <= 1000) score += 30;
  if ((input.sevenDayChange ?? 0) > 1000) score += 20;
  if ((input.thirtyDayChange ?? 0) > 5000) score += 20;
  if (input.appearedSevenDays) score += 10;
  if (input.roseSevenDays) score += 20;
  return score;
}

export function opportunitySuggestion(type: OpportunityType): string {
  const suggestions: Record<OpportunityType, string> = {
    new_opportunity: "加入观察清单，确认是否与产品相关。",
    burst: "优先复盘来源，适合重点跟进内容和广告素材。",
    rising: "持续跟踪排名，评估是否扩展长尾词覆盖。",
    high_potential: "保持监控，适合作为核心候选词维护。",
    stable_core: "建议收藏并保护，避免核心词排名波动。"
  };
  return suggestions[type];
}

export function detectOpportunity(input: {
  keyword: string;
  currentRank: number;
  firstSeenDate?: string;
  currentDate: string;
  sevenDayRank: number | null;
  thirtyDayRank: number | null;
  recentRanks: Array<number | null>;
}): OpportunityRow[] {
  const sevenDayChange = getChangeValue(input.currentRank, input.sevenDayRank);
  const thirtyDayChange = getChangeValue(input.currentRank, input.thirtyDayRank);
  const appearedSevenDays = input.recentRanks.slice(-7).filter((rank) => rank !== null).length === 7;
  const roseSevenDays = isConsecutiveRising(input.recentRanks, 7);
  const score = scoreOpportunity({
    currentRank: input.currentRank,
    sevenDayChange,
    thirtyDayChange,
    appearedSevenDays,
    roseSevenDays
  });
  const rows: OpportunityRow[] = [];
  const push = (type: OpportunityType) =>
    rows.push({
      keyword: input.keyword,
      rank: input.currentRank,
      sevenDayChange,
      thirtyDayChange,
      type,
      score,
      suggestion: opportunitySuggestion(type)
    });

  if (input.firstSeenDate === input.currentDate && input.currentRank <= 50000) push("new_opportunity");
  if ((sevenDayChange ?? 0) > 5000) push("burst");
  if (roseSevenDays) push("rising");
  if (input.currentRank >= 100 && input.currentRank <= 5000 && (thirtyDayChange ?? 0) > 0) push("high_potential");
  if (input.recentRanks.slice(-30).length >= 30 && input.recentRanks.slice(-30).every((rank) => rank !== null && rank <= 1000)) {
    push("stable_core");
  }

  return rows;
}

export function alertLevel(type: AlertType, changeValue: number | null): AlertLevel {
  if (type === "lost" || type === "drop_top100") return "high";
  if (type === "drop_top1000" || Math.abs(changeValue ?? 0) > 10000) return "medium";
  return "low";
}

export function detectAlerts(input: {
  keyword: string;
  currentRank: number | null;
  compareRank: number | null;
  recentRanks: Array<number | null>;
  alertDate: string;
  isFavorite?: boolean;
}): AlertRow[] {
  const changeValue = getChangeValue(input.currentRank, input.compareRank);
  const rows: AlertRow[] = [];
  const push = (type: AlertType) =>
    rows.push({
      keyword: input.keyword,
      type,
      level: alertLevel(type, changeValue),
      currentRank: input.currentRank,
      compareRank: input.compareRank,
      changeValue,
      alertDate: input.alertDate,
      status: "unhandled"
    });

  if (input.compareRank !== null && input.compareRank <= 100 && (input.currentRank ?? Number.POSITIVE_INFINITY) > 100) push("drop_top100");
  if (input.compareRank !== null && input.compareRank <= 1000 && (input.currentRank ?? Number.POSITIVE_INFINITY) > 1000) push("drop_top1000");
  if (isConsecutiveFalling(input.recentRanks, 3)) push("continuous_down");
  if (input.compareRank !== null && input.currentRank === null) push("lost");
  if (Math.abs(changeValue ?? 0) > 10000) push("large_fluctuation");
  if (input.isFavorite && (changeValue ?? 0) < -500) push("favorite_down");

  return rows;
}

export function normalizeKeyword(raw: unknown): string {
  return String(raw ?? "").trim();
}

export function normalizeRank(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}
