import { Controller, Get, Query } from "@nestjs/common";
import { buildRankDistribution, summarizeDashboard } from "@aba/shared";
import { KeywordService } from "./keyword.service.js";

@Controller("dashboard")
export class DashboardController {
  constructor(private readonly keywords: KeywordService) {}

  @Get()
  async dashboard(@Query("date") date?: string, @Query("compareDate") compareDate?: string) {
    const currentDate = date ?? (await this.keywords.latestDate());
    const previous = compareDate ?? this.keywords.previousDate(currentDate);
    const currentRows = await this.keywords.rowsByDate(currentDate);
    const compareRows = await this.keywords.rowsByDate(previous);
    const trend = await this.buildTrend(currentDate);

    return {
      date: currentDate,
      compareDate: previous,
      summary: summarizeDashboard(currentRows, compareRows),
      distribution: buildRankDistribution(currentRows),
      trend,
      topUp: this.rankChanges(currentRows, compareRows, "up"),
      topDown: this.rankChanges(currentRows, compareRows, "down")
    };
  }

  private rankChanges(currentRows: any[], compareRows: any[], direction: "up" | "down") {
    const compare = new Map(compareRows.map((row) => [row.keyword, row.rank]));
    return currentRows
      .map((row) => ({ keyword: row.keyword, rank: row.rank, changeValue: (compare.get(row.keyword) ?? row.rank) - row.rank }))
      .filter((row) => (direction === "up" ? row.changeValue > 0 : row.changeValue < 0))
      .sort((a, b) => (direction === "up" ? b.changeValue - a.changeValue : a.changeValue - b.changeValue))
      .slice(0, 20);
  }

  private async buildTrend(date: string) {
    const points = [];
    for (let offset = 29; offset >= 0; offset -= 1) {
      const value = new Date(`${date}T00:00:00Z`);
      value.setUTCDate(value.getUTCDate() - offset);
      const currentDate = value.toISOString().slice(0, 10);
      const previous = this.keywords.previousDate(currentDate);
      const currentRows = await this.keywords.rowsByDate(currentDate);
      const compareRows = await this.keywords.rowsByDate(previous);
      points.push({ date: currentDate, ...summarizeDashboard(currentRows, compareRows) });
    }
    return points;
  }
}
