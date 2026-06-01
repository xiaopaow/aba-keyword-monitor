import { Injectable, Logger } from "@nestjs/common";
import type { RowDataPacket } from "mysql2/promise";
import type { AbaSearchTermRow, AbaSearchTermsResponse, AbaTopProduct, AbaWeek, ChangeType } from "@aba/shared";
import { MysqlService } from "../db/mysql.service.js";

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

interface WeekTable extends RowDataPacket {
  table_name: string;
  period_start: string | null;
  period_end: string | null;
  marketplace_id: string | null;
  total_terms: number;
}

interface CountRow extends RowDataPacket {
  total: number;
}

interface SearchRow extends RowDataPacket {
  search_term: string;
  department_name: string | null;
  current_rank: number | null;
  compare_rank: number | null;
  rank_change: number | null;
  change_type: ChangeType;
  top_products: string | null;
}

@Injectable()
export class AbaService {
  private readonly logger = new Logger(AbaService.name);

  constructor(private readonly mysql: MysqlService) {}

  async weeks(): Promise<AbaWeek[]> {
    const database = process.env.MYSQL_DATABASE ?? "lingxing";
    const tables = await this.mysql.query<RowDataPacket>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = ?
         AND table_name REGEXP '^aba_search_terms(_[0-9]{8})?$'
       ORDER BY table_name DESC`,
      [database]
    );

    const weeks: AbaWeek[] = [];
    for (const row of tables as Array<{ table_name: string }>) {
      const tableName = row.table_name;
      if (!isSafeAbaTableName(tableName)) continue;
      try {
        const [meta] = await this.mysql.query<WeekTable>(
          `SELECT
             ${dateExpression(tableName)} AS period_start,
             ${hasFullSchemaExpression("report_end_date")} AS period_end,
             ${hasFullSchemaExpression("marketplace_id")} AS marketplace_id,
             COUNT(DISTINCT ${termColumnExpression(tableName)}) AS total_terms
           FROM ${quoteIdentifier(tableName)}`
        );
        const fallbackStart = dateFromTableName(tableName);
        const periodStart = normalizeDate(meta?.period_start) ?? fallbackStart;
        if (!periodStart) continue;
        const periodEnd = normalizeDate(meta?.period_end) ?? periodStart;
        weeks.push({
          id: Number(periodStart.replaceAll("-", "")),
          marketplaceId: meta?.marketplace_id ?? "ATVPDKIKX0DER",
          periodStart,
          periodEnd,
          label: `${periodStart} ~ ${periodEnd}`,
          totalTerms: Number(meta?.total_terms ?? 0)
        });
      } catch (error) {
        this.logger.warn(`Skip ABA table ${tableName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return dedupeWeeks(weeks).sort((a, b) => b.periodStart.localeCompare(a.periodStart));
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

    const currentTable = tableNameFromWeek(currentWeek.periodStart);
    const compareTable = compareWeek ? tableNameFromWeek(compareWeek.periodStart) : null;
    const currentExists = await this.tableExists(currentTable);
    if (!currentExists) {
      return { rows: [], page, pageSize, total: 0, weekStart: currentWeek.periodStart, weekEnd: currentWeek.periodEnd, compareWeekStart: null };
    }
    const compareExists = compareTable ? await this.tableExists(compareTable) : false;

    const params: unknown[] = [];
    const where: string[] = [];
    const add = (value: unknown) => {
      params.push(value);
      return "?";
    };

    if (query.keyword?.trim()) where.push(`LOWER(base.search_term) LIKE LOWER(${add(`%${query.keyword.trim()}%`)})`);
    if (query.excludeKeyword?.trim()) where.push(`LOWER(base.search_term) NOT LIKE LOWER(${add(`%${query.excludeKeyword.trim()}%`)})`);
    if (query.rankMin) where.push(`base.current_rank >= ${add(Number(query.rankMin))}`);
    if (query.rankMax) where.push(`base.current_rank <= ${add(Number(query.rankMax))}`);
    if (query.asin?.trim()) where.push(`EXISTS (
      SELECT 1 FROM ${quoteIdentifier(currentTable)} asin_filter
      WHERE asin_filter.search_term = base.search_term
        AND LOWER(asin_filter.clicked_asin) = LOWER(${add(query.asin.trim())})
    )`);
    if (query.clickShareMin) where.push(`base.max_click_share >= ${add(Number(query.clickShareMin) / 100)}`);
    if (query.clickShareMax) where.push(`base.max_click_share <= ${add(Number(query.clickShareMax) / 100)}`);
    if (query.conversionShareMin) where.push(`base.max_conversion_share >= ${add(Number(query.conversionShareMin) / 100)}`);
    if (query.conversionShareMax) where.push(`base.max_conversion_share <= ${add(Number(query.conversionShareMax) / 100)}`);
    if (query.changeType && query.changeType !== "all") where.push(`base.change_type = ${add(query.changeType)}`);

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
    const baseSql = this.baseSql(currentTable, compareExists ? compareTable : null);

    const countRows = await this.mysql.query<CountRow>(`${baseSql} SELECT COUNT(*) AS total FROM base ${whereSql}`, params);
    const total = Number(countRows[0]?.total ?? 0);

    const dataRows = await this.mysql.query<SearchRow>(
      `${baseSql}
       SELECT
         base.search_term,
         base.department_name,
         base.current_rank,
         base.compare_rank,
         base.rank_change,
         base.change_type,
         COALESCE((
           SELECT JSON_ARRAYAGG(JSON_OBJECT(
             'asin', ranked.clicked_asin,
             'itemName', ranked.clicked_item_name,
             'clickShareRank', ranked.click_share_rank,
             'clickShare', ranked.click_share,
             'conversionShare', ranked.conversion_share
           ))
           FROM (
             SELECT clicked_asin, clicked_item_name, click_share_rank, click_share, conversion_share
             FROM ${quoteIdentifier(currentTable)}
             WHERE search_term = base.search_term
             ORDER BY click_share_rank IS NULL, click_share_rank ASC
             LIMIT 3
           ) ranked
         ), JSON_ARRAY()) AS top_products
       FROM base
       ${whereSql}
       ORDER BY ${sort} ${order}, base.search_term ASC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );

    const rows: AbaSearchTermRow[] = dataRows.map((row) => ({
      keyword: row.search_term,
      departmentName: row.department_name,
      currentRank: nullableNumber(row.current_rank),
      compareRank: nullableNumber(row.compare_rank),
      rankChange: nullableNumber(row.rank_change),
      changeType: row.change_type,
      topProducts: parseTopProducts(row.top_products)
    }));

    return {
      rows,
      page,
      pageSize,
      total,
      weekStart: currentWeek.periodStart,
      weekEnd: currentWeek.periodEnd,
      compareWeekStart: compareExists ? compareWeek?.periodStart ?? null : null
    };
  }

  private async tableExists(tableName: string) {
    if (!isSafeAbaTableName(tableName)) return false;
    const database = process.env.MYSQL_DATABASE ?? "lingxing";
    const rows = await this.mysql.query<RowDataPacket>(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = ? LIMIT 1",
      [database, tableName]
    );
    return rows.length > 0;
  }

  private baseSql(currentTable: string, compareTable: string | null) {
    const current = quoteIdentifier(currentTable);
    const compareJoin = compareTable
      ? `LEFT JOIN (
           SELECT search_term, MIN(search_frequency_rank) AS compare_rank
           FROM ${quoteIdentifier(compareTable)}
           GROUP BY search_term
         ) p ON p.search_term = c.search_term`
      : "LEFT JOIN (SELECT NULL AS search_term, NULL AS compare_rank) p ON FALSE";

    return `
      WITH c AS (
        SELECT
          search_term,
          MIN(search_frequency_rank) AS current_rank,
          MIN(department_name) AS department_name,
          MAX(click_share) AS max_click_share,
          MAX(conversion_share) AS max_conversion_share
        FROM ${current}
        GROUP BY search_term
      ),
      base AS (
        SELECT
          c.search_term,
          c.department_name,
          c.current_rank,
          p.compare_rank,
          CASE
            WHEN p.compare_rank IS NULL THEN NULL
            ELSE p.compare_rank - c.current_rank
          END AS rank_change,
          CASE
            WHEN p.compare_rank IS NULL THEN 'new'
            WHEN c.current_rank < p.compare_rank THEN 'up'
            WHEN c.current_rank > p.compare_rank THEN 'down'
            ELSE 'flat'
          END AS change_type,
          COALESCE(c.max_click_share, 0) AS max_click_share,
          COALESCE(c.max_conversion_share, 0) AS max_conversion_share
        FROM c
        ${compareJoin}
      )`;
  }
}

function quoteIdentifier(name: string) {
  if (!isSafeAbaTableName(name)) throw new Error(`Unsafe ABA table name: ${name}`);
  return `\`${name}\``;
}

function isSafeAbaTableName(name: string) {
  return /^aba_search_terms(_\d{8})?$/.test(name);
}

function dateFromTableName(tableName: string) {
  const match = tableName.match(/^aba_search_terms_(\d{4})(\d{2})(\d{2})$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function tableNameFromWeek(periodStart: string) {
  return `aba_search_terms_${periodStart.replaceAll("-", "")}`;
}

function normalizeDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseTopProducts(raw: string | AbaTopProduct[] | null): AbaTopProduct[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function dedupeWeeks(weeks: AbaWeek[]) {
  const map = new Map<string, AbaWeek>();
  for (const week of weeks) {
    if (!map.has(week.periodStart)) map.set(week.periodStart, week);
  }
  return [...map.values()];
}

function dateExpression(tableName: string) {
  return dateFromTableName(tableName) ? "MIN(report_start_date)" : "MIN(COALESCE(report_start_date, report_date))";
}

function termColumnExpression(_tableName: string) {
  return "search_term";
}

function hasFullSchemaExpression(column: "report_end_date" | "marketplace_id") {
  return column === "report_end_date" ? "MIN(report_end_date)" : "MIN(marketplace_id)";
}
