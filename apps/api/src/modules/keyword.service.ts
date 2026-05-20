import { Injectable } from "@nestjs/common";
import type { ChangeType, KeywordComparison, KeywordDaily, RankRange } from "@aba/shared";
import { compareKeywordSets, inRankRange } from "@aba/shared";
import { DatabaseService } from "../db/database.service.js";

interface KeywordQuery {
  date: string;
  compareDate?: string;
  keyword?: string;
  rankRange?: RankRange;
  changeType?: ChangeType;
  tag?: string;
  isFavorite?: string;
  page?: string;
  pageSize?: string;
}

@Injectable()
export class KeywordService {
  constructor(private readonly db: DatabaseService) {}

  async rowsByDate(date: string): Promise<KeywordDaily[]> {
    const result = await this.db.query<{ keyword: string; rank: number; report_date: string }>(
      "SELECT keyword, rank_num AS rank, report_date::text FROM aba_keyword_daily WHERE report_date = $1 ORDER BY rank_num ASC",
      [date]
    );
    return result.rows.map((row) => ({ keyword: row.keyword, rank: Number(row.rank), reportDate: row.report_date }));
  }

  async profiles(keywords?: string[]) {
    if (keywords?.length) {
      const result = await this.db.query(
        `SELECT keyword, first_seen_date::text, last_seen_date::text, best_rank, worst_rank, tag, note, is_favorite
         FROM keyword_profile WHERE keyword = ANY($1)`,
        [keywords]
      );
      return result.rows.map(this.mapProfile);
    }

    const result = await this.db.query(
      "SELECT keyword, first_seen_date::text, last_seen_date::text, best_rank, worst_rank, tag, note, is_favorite FROM keyword_profile"
    );
    return result.rows.map(this.mapProfile);
  }

  async list(query: KeywordQuery) {
    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize ?? 20), 1), 200);
    const compareDate = query.compareDate ?? this.previousDate(query.date);
    const currentRows = await this.rowsByDate(query.date);
    const compareRows = await this.rowsByDate(compareDate);
    const profiles = await this.profiles();

    let rows = compareKeywordSets(currentRows, compareRows, profiles);
    if (query.keyword) rows = rows.filter((row) => row.keyword.toLowerCase().includes(query.keyword!.toLowerCase()));
    if (query.rankRange && query.rankRange !== "all") rows = rows.filter((row) => inRankRange(row.currentRank, query.rankRange!));
    if (query.changeType) rows = rows.filter((row) => row.changeType === query.changeType);
    if (query.tag) rows = rows.filter((row) => row.tag === query.tag);
    if (query.isFavorite) rows = rows.filter((row) => Boolean(row.isFavorite) === (query.isFavorite === "true"));

    rows.sort((a, b) => (a.currentRank ?? Number.POSITIVE_INFINITY) - (b.currentRank ?? Number.POSITIVE_INFINITY));
    const total = rows.length;
    return {
      rows: rows.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      total
    };
  }

  async detail(keyword: string, date?: string) {
    const profileRows = await this.profiles([keyword]);
    const profile = profileRows[0] ?? { keyword };
    const currentDate = date ?? (await this.latestDate());
    const compareDate = this.previousDate(currentDate);
    const comparison = compareKeywordSets(await this.rowsByDate(currentDate), await this.rowsByDate(compareDate), [profile]).find(
      (row) => row.keyword === keyword
    );
    const trend = await this.trend(keyword, "all");

    return {
      ...profile,
      currentRank: comparison?.currentRank ?? null,
      yesterdayRank: comparison?.compareRank ?? null,
      sevenDayChange: await this.changeFromDays(keyword, currentDate, 7),
      thirtyDayChange: await this.changeFromDays(keyword, currentDate, 30),
      trend
    };
  }

  async trend(keyword: string, range = "30d") {
    const days = range === "all" ? 10000 : Number(range.replace("d", ""));
    const result = await this.db.query<{ report_date: string; rank_num: number }>(
      `SELECT report_date::text, rank_num
       FROM aba_keyword_daily
       WHERE keyword = $1
       ORDER BY report_date DESC
       LIMIT $2`,
      [keyword, days]
    );

    return result.rows
      .map((row) => ({ date: row.report_date, rank: row.rank_num }))
      .reverse()
      .map((row, index, rows) => {
        const previous = rows[index - 1]?.rank ?? null;
        return {
          ...row,
          changeValue: previous === null ? null : previous - row.rank,
          changeType: previous === null ? "flat" : previous > row.rank ? "up" : previous < row.rank ? "down" : "flat"
        };
      });
  }

  async updateProfile(keyword: string, payload: { tag?: string; note?: string; isFavorite?: boolean }) {
    const result = await this.db.query(
      `INSERT INTO keyword_profile (keyword, tag, note, is_favorite, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (keyword) DO UPDATE SET
         tag = COALESCE(EXCLUDED.tag, keyword_profile.tag),
         note = COALESCE(EXCLUDED.note, keyword_profile.note),
         is_favorite = COALESCE(EXCLUDED.is_favorite, keyword_profile.is_favorite),
         updated_at = CURRENT_TIMESTAMP
       RETURNING keyword, tag, note, is_favorite`,
      [keyword, payload.tag ?? null, payload.note ?? null, payload.isFavorite ?? null]
    );
    return result.rows[0];
  }

  async latestDate() {
    const result = await this.db.query<{ report_date: string }>("SELECT MAX(report_date)::text AS report_date FROM aba_keyword_daily");
    return result.rows[0]?.report_date ?? new Date().toISOString().slice(0, 10);
  }

  previousDate(date: string) {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() - 1);
    return value.toISOString().slice(0, 10);
  }

  private async changeFromDays(keyword: string, date: string, days: number) {
    const dateValue = new Date(`${date}T00:00:00Z`);
    dateValue.setUTCDate(dateValue.getUTCDate() - days);
    const target = dateValue.toISOString().slice(0, 10);
    const result = await this.db.query<{ current_rank: number; old_rank: number }>(
      `SELECT c.rank_num AS current_rank, o.rank_num AS old_rank
       FROM aba_keyword_daily c
       LEFT JOIN aba_keyword_daily o ON o.keyword = c.keyword AND o.report_date = $3
       WHERE c.keyword = $1 AND c.report_date = $2`,
      [keyword, date, target]
    );
    const row = result.rows[0];
    if (!row?.old_rank) return null;
    return row.old_rank - row.current_rank;
  }

  private mapProfile(row: any) {
    return {
      keyword: row.keyword,
      firstSeenDate: row.first_seen_date,
      lastSeenDate: row.last_seen_date,
      bestRank: row.best_rank,
      worstRank: row.worst_rank,
      tag: row.tag,
      note: row.note,
      isFavorite: row.is_favorite
    };
  }
}
