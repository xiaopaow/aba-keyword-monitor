import { Injectable } from "@nestjs/common";
import { detectAlerts, detectOpportunity, type AlertRow, type OpportunityRow } from "@aba/shared";
import { DatabaseService } from "../db/database.service.js";
import { KeywordService } from "./keyword.service.js";

@Injectable()
export class RuleService {
  constructor(
    private readonly db: DatabaseService,
    private readonly keywords: KeywordService
  ) {}

  async opportunities(date?: string, type?: string) {
    const currentDate = date ?? (await this.keywords.latestDate());
    const currentRows = await this.keywords.rowsByDate(currentDate);
    const profiles = await this.keywords.profiles(currentRows.map((row) => row.keyword));
    const profileMap = new Map(profiles.map((profile) => [profile.keyword, profile]));
    const rows: OpportunityRow[] = [];

    for (const current of currentRows) {
      const recentRanks = await this.rankSeries(current.keyword, currentDate, 30);
      const sevenDayRank = recentRanks.at(-8) ?? null;
      const thirtyDayRank = recentRanks.at(0) ?? null;
      rows.push(
        ...detectOpportunity({
          keyword: current.keyword,
          currentRank: current.rank,
          firstSeenDate: profileMap.get(current.keyword)?.firstSeenDate,
          currentDate,
          sevenDayRank,
          thirtyDayRank,
          recentRanks
        })
      );
    }

    return {
      date: currentDate,
      rows: type ? rows.filter((row) => row.type === type) : rows
    };
  }

  async alerts(date?: string, type?: string) {
    const currentDate = date ?? (await this.keywords.latestDate());
    const compareDate = this.keywords.previousDate(currentDate);
    const currentRows = await this.keywords.rowsByDate(currentDate);
    const compareRows = await this.keywords.rowsByDate(compareDate);
    const profiles = await this.keywords.profiles();
    const profileMap = new Map(profiles.map((profile) => [profile.keyword, profile]));
    const currentMap = new Map(currentRows.map((row) => [row.keyword, row.rank]));
    const compareMap = new Map(compareRows.map((row) => [row.keyword, row.rank]));
    const allKeywords = new Set([...currentMap.keys(), ...compareMap.keys()]);
    const rows: AlertRow[] = [];

    for (const keyword of allKeywords) {
      rows.push(
        ...detectAlerts({
          keyword,
          currentRank: currentMap.get(keyword) ?? null,
          compareRank: compareMap.get(keyword) ?? null,
          recentRanks: await this.rankSeries(keyword, currentDate, 3),
          alertDate: currentDate,
          isFavorite: profileMap.get(keyword)?.isFavorite
        })
      );
    }

    await this.persistAlerts(rows);
    return {
      date: currentDate,
      rows: type ? rows.filter((row) => row.type === type) : rows
    };
  }

  async updateAlert(id: number, status: "handled" | "unhandled") {
    const result = await this.db.query(
      "UPDATE keyword_alert SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *",
      [id, status]
    );
    return result.rows[0];
  }

  private async rankSeries(keyword: string, date: string, days: number) {
    const result = await this.db.query<{ report_date: string; rank_num: number }>(
      `SELECT report_date::text, rank_num
       FROM aba_keyword_daily
       WHERE keyword = $1 AND report_date <= $2
       ORDER BY report_date DESC
       LIMIT $3`,
      [keyword, date, days]
    );
    return result.rows.reverse().map((row) => row.rank_num);
  }

  private async persistAlerts(rows: AlertRow[]) {
    if (!rows.length) return;
    await this.db.transaction(async (client) => {
      for (const row of rows) {
        await client.query(
          `INSERT INTO keyword_alert (keyword, alert_type, alert_level, current_rank, compare_rank, rank_change, alert_date, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [row.keyword, row.type, row.level, row.currentRank, row.compareRank, row.changeValue, row.alertDate, row.status]
        );
      }
    });
  }
}
