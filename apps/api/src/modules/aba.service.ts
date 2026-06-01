import { Injectable } from "@nestjs/common";
import type { AbaSearchTermRow, AbaSearchTermsResponse, AbaTopProduct, AbaWeek, ChangeType } from "@aba/shared";
import { DatabaseService } from "../db/database.service.js";

interface AbaSearchQuery {
  weekStart?: string;
  compareWeekStart?: string;
  keyword?: string;
  excludeKeyword?: string;
  asin?: string;
  rankMin?: string;
  rankMax?: string;
  clickShareMin?: string;
  clickShareMax?: string;
  conversionShareMin?: string;
  conversionShareMax?: string;
  changeType?: ChangeType | "all";
  sort?: "rank" | "rankChange" | "clickShare" | "conversionShare" | "keyword";
  order?: "asc" | "desc";
  page?: string;
  pageSize?: string;
}

@Injectable()
export class AbaService {
  constructor(private readonly db: DatabaseService) {}

  async weeks(): Promise<AbaWeek[]> {
    const result = await this.db.query<{
      id: string;
      marketplace_id: string;
      period_start: string;
      period_end: string;
      total_terms: string;
    }>(
      `SELECT r.id, r.marketplace_id, r.period_start::text, r.period_end::text, COUNT(t.id)::text AS total_terms
       FROM aba_weekly_report r
       LEFT JOIN aba_search_term_weekly t ON t.report_id = r.id
       GROUP BY r.id
       ORDER BY r.period_start DESC
       LIMIT 80`
    );

    return result.rows.map((row) => ({
      id: Number(row.id),
      marketplaceId: row.marketplace_id,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      label: `${row.period_start} ~ ${row.period_end}`,
      totalTerms: Number(row.total_terms)
    }));
  }

  async searchTerms(query: AbaSearchQuery): Promise<AbaSearchTermsResponse> {
    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize ?? 50), 1), 200);
    const weeks = await this.weeks();
    const currentWeek = weeks.find((week) => week.periodStart === query.weekStart) ?? weeks[0] ?? null;
    const currentIndex = currentWeek ? weeks.findIndex((week) => week.periodStart === currentWeek.periodStart) : -1;
    const compareWeek =
      weeks.find((week) => week.periodStart === query.compareWeekStart) ?? (currentIndex >= 0 ? weeks[currentIndex + 1] : null) ?? null;

    if (!currentWeek) {
      return { rows: [], page, pageSize, total: 0, weekStart: null, weekEnd: null, compareWeekStart: null };
    }

    const params: unknown[] = [currentWeek.id, compareWeek?.id ?? null];
    const where: string[] = [];

    const addParam = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };

    if (query.keyword?.trim()) where.push(`LOWER(base.search_term) LIKE LOWER(${addParam(`%${query.keyword.trim()}%`)})`);
    if (query.excludeKeyword?.trim()) where.push(`LOWER(base.search_term) NOT LIKE LOWER(${addParam(`%${query.excludeKeyword.trim()}%`)})`);
    if (query.rankMin) where.push(`base.current_rank >= ${addParam(Number(query.rankMin))}`);
    if (query.rankMax) where.push(`base.current_rank <= ${addParam(Number(query.rankMax))}`);
    if (query.asin?.trim()) where.push(`EXISTS (
      SELECT 1 FROM aba_search_term_product ap
      WHERE ap.report_id = base.current_report_id
        AND ap.search_term = base.search_term
        AND LOWER(ap.clicked_asin) = LOWER(${addParam(query.asin.trim())})
    )`);
    if (query.clickShareMin) where.push(`base.max_click_share >= ${addParam(Number(query.clickShareMin) / 100)}`);
    if (query.clickShareMax) where.push(`base.max_click_share <= ${addParam(Number(query.clickShareMax) / 100)}`);
    if (query.conversionShareMin) where.push(`base.max_conversion_share >= ${addParam(Number(query.conversionShareMin) / 100)}`);
    if (query.conversionShareMax) where.push(`base.max_conversion_share <= ${addParam(Number(query.conversionShareMax) / 100)}`);
    if (query.changeType && query.changeType !== "all") where.push(`base.change_type = ${addParam(query.changeType)}`);

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const sortMap = {
      rank: "base.current_rank",
      rankChange: "base.rank_change",
      clickShare: "base.max_click_share",
      conversionShare: "base.max_conversion_share",
      keyword: "base.search_term"
    } satisfies Record<NonNullable<AbaSearchQuery["sort"]>, string>;
    const sort = sortMap[query.sort ?? "rank"] ?? sortMap.rank;
    const order = query.order === "desc" ? "DESC" : "ASC";

    const baseSql = `
      WITH base AS (
        SELECT
          c.report_id AS current_report_id,
          c.search_term,
          c.department_name,
          c.search_frequency_rank AS current_rank,
          p.search_frequency_rank AS compare_rank,
          CASE
            WHEN p.search_frequency_rank IS NULL THEN NULL
            ELSE p.search_frequency_rank - c.search_frequency_rank
          END AS rank_change,
          CASE
            WHEN p.search_frequency_rank IS NULL THEN 'new'
            WHEN c.search_frequency_rank < p.search_frequency_rank THEN 'up'
            WHEN c.search_frequency_rank > p.search_frequency_rank THEN 'down'
            ELSE 'flat'
          END AS change_type,
          COALESCE(prod.max_click_share, 0) AS max_click_share,
          COALESCE(prod.max_conversion_share, 0) AS max_conversion_share
        FROM aba_search_term_weekly c
        LEFT JOIN aba_search_term_weekly p ON p.report_id = $2 AND p.search_term = c.search_term
        LEFT JOIN (
          SELECT report_id, search_term, MAX(click_share) AS max_click_share, MAX(conversion_share) AS max_conversion_share
          FROM aba_search_term_product
          GROUP BY report_id, search_term
        ) prod ON prod.report_id = c.report_id AND prod.search_term = c.search_term
        WHERE c.report_id = $1
      )`;

    const countResult = await this.db.query<{ total: string }>(
      `${baseSql} SELECT COUNT(*)::text AS total FROM base ${whereSql}`,
      params
    );
    const total = Number(countResult.rows[0]?.total ?? 0);

    const dataResult = await this.db.query<{
      search_term: string;
      department_name: string | null;
      current_rank: number | null;
      compare_rank: number | null;
      rank_change: number | null;
      change_type: ChangeType;
      top_products: AbaTopProduct[] | null;
    }>(
      `${baseSql}
       SELECT
         base.search_term,
         base.department_name,
         base.current_rank,
         base.compare_rank,
         base.rank_change,
         base.change_type,
         COALESCE(products.top_products, '[]'::json) AS top_products
       FROM base
       LEFT JOIN LATERAL (
         SELECT json_agg(json_build_object(
           'asin', ranked.clicked_asin,
           'itemName', ranked.clicked_item_name,
           'clickShareRank', ranked.click_share_rank,
           'clickShare', ranked.click_share,
           'conversionShare', ranked.conversion_share
         ) ORDER BY ranked.click_share_rank NULLS LAST) AS top_products
         FROM (
           SELECT clicked_asin, clicked_item_name, click_share_rank, click_share::float AS click_share, conversion_share::float AS conversion_share
           FROM aba_search_term_product
           WHERE report_id = base.current_report_id AND search_term = base.search_term
           ORDER BY click_share_rank NULLS LAST
           LIMIT 3
         ) ranked
       ) products ON TRUE
       ${whereSql}
       ORDER BY ${sort} ${order} NULLS LAST, base.search_term ASC
       LIMIT ${addParam(pageSize)} OFFSET ${addParam((page - 1) * pageSize)}`,
      params
    );

    const rows: AbaSearchTermRow[] = dataResult.rows.map((row) => ({
      keyword: row.search_term,
      departmentName: row.department_name,
      currentRank: row.current_rank === null ? null : Number(row.current_rank),
      compareRank: row.compare_rank === null ? null : Number(row.compare_rank),
      rankChange: row.rank_change === null ? null : Number(row.rank_change),
      changeType: row.change_type,
      topProducts: row.top_products ?? []
    }));

    return {
      rows,
      page,
      pageSize,
      total,
      weekStart: currentWeek.periodStart,
      weekEnd: currentWeek.periodEnd,
      compareWeekStart: compareWeek?.periodStart ?? null
    };
  }
}
