import { BadRequestException, Injectable, Logger } from "@nestjs/common";
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
  row_count_estimate: number | null;
  marketplace_id: string | null;
}

interface CountRow extends RowDataPacket {
  total: number;
}

interface SearchRow extends RowDataPacket {
  search_term: string;
  keyword_cn_explanation: string | null;
  department_name: string | null;
  current_rank: number | null;
  compare_rank: number | null;
  rank_change: number | null;
  change_type: ChangeType;
  top_products: string | null;
}

interface WidePageRow extends RowDataPacket {
  search_term: string;
  keyword_cn_explanation: string | null;
  department_name: string | null;
  current_rank: number | null;
  compare_rank: number | null;
  max_click_share: number | null;
  max_conversion_share: number | null;
  product1_asin: string | null;
  product1_item_name: string | null;
  product1_click_share: number | null;
  product1_conversion_share: number | null;
  product1_image_url: string | null;
  product2_asin: string | null;
  product2_item_name: string | null;
  product2_click_share: number | null;
  product2_conversion_share: number | null;
  product2_image_url: string | null;
  product3_asin: string | null;
  product3_item_name: string | null;
  product3_click_share: number | null;
  product3_conversion_share: number | null;
  product3_image_url: string | null;
}

interface CompareRankRow extends RowDataPacket {
  search_term: string;
  compare_rank: number | null;
}

interface KeywordExplanationRow extends RowDataPacket {
  search_term: string;
  cn_explanation: string | null;
}

interface AsinAssetRow extends RowDataPacket {
  asin: string;
  image_url: string | null;
  price: number | null;
  rating: number | null;
  review_count: number | null;
  detail_url: string | null;
}

interface AsinAsset {
  imageUrl: string | null;
  price: number | null;
  rating: number | null;
  reviewCount: number | null;
  detailUrl: string | null;
}

@Injectable()
export class AbaService {
  private readonly logger = new Logger(AbaService.name);
  private readonly exactTableCountCache = new Map<string, { total: number; expiresAt: number }>();
  private readonly filteredTotalCache = new Map<string, { total: number; expiresAt: number }>();

  constructor(private readonly mysql: MysqlService) {}

  async weeks(): Promise<AbaWeek[]> {
    const database = process.env.MYSQL_DATABASE ?? "lingxing";
    const tables = await this.mysql.query<WeekTable>(
      `SELECT TABLE_NAME AS table_name, COALESCE(AUTO_INCREMENT - 1, TABLE_ROWS) AS row_count_estimate
       FROM information_schema.tables
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME REGEXP '^aba_search_terms_[0-9]{8}$'
       ORDER BY TABLE_NAME DESC`,
      [database]
    );

    const weeks: AbaWeek[] = [];
    for (const row of tables) {
      const tableName = row.table_name;
      if (!isSafeAbaTableName(tableName)) continue;
      try {
        const fallbackStart = dateFromTableName(tableName);
        const periodStart = fallbackStart;
        if (!periodStart) continue;
        const periodEnd = addDays(periodStart, 6);
        weeks.push({
          id: Number(periodStart.replaceAll("-", "")),
          marketplaceId: "ATVPDKIKX0DER",
          periodStart,
          periodEnd,
          label: `${periodStart} ~ ${periodEnd}`,
          totalTerms: Number(row.row_count_estimate ?? 0)
        });
      } catch (error) {
        this.logger.warn(`Skip ABA table ${tableName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return dedupeWeeks(weeks).sort((a, b) => b.periodStart.localeCompare(a.periodStart));
  }

  async searchTerms(query: AbaSearchQuery, visibleLimit: number | null = null): Promise<AbaSearchTermsResponse> {
    return this.searchTermsWithLimit(query, 200, visibleLimit);
  }

  async exportSearchTerms(query: AbaSearchQuery, visibleLimit: number | null = null): Promise<AbaSearchTermsResponse> {
    return this.searchTermsWithLimit({ ...query, page: "1" }, 10000, visibleLimit);
  }

  private async searchTermsWithLimit(query: AbaSearchQuery, maxPageSize: number, visibleLimit: number | null = null): Promise<AbaSearchTermsResponse> {
    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize ?? 50), 1), maxPageSize);
    const excludedKeywords = parseExcludedKeywords(query.excludeKeyword);
    const weeks = await this.weeks();
    const currentWeek = weeks.find((week) => week.periodStart === query.weekStart) ?? weeks[0] ?? null;
    if (!currentWeek) {
      return { rows: [], page, pageSize, total: 0, weekStart: null, weekEnd: null, compareWeekStart: null };
    }

    const currentIndex = weeks.findIndex((week) => week.periodStart === currentWeek.periodStart);
    const explicitCompare = typeof query.compareWeekStart === "string";
    const requestedCompareWeek = query.compareWeekStart ? weeks.find((week) => week.periodStart === query.compareWeekStart) ?? null : null;
    if (requestedCompareWeek && requestedCompareWeek.periodStart >= currentWeek.periodStart) {
      throw new BadRequestException("对比周必须早于报告周。");
    }
    const compareWeek = explicitCompare
      ? requestedCompareWeek
      : (currentIndex >= 0 ? weeks[currentIndex + 1] : null) ?? null;

    const currentTable = tableNameFromWeek(currentWeek.periodStart);
    const compareTable = compareWeek ? tableNameFromWeek(compareWeek.periodStart) : null;
    const currentExists = await this.tableExists(currentTable);
    if (!currentExists) {
      return { rows: [], page, pageSize, total: 0, weekStart: currentWeek.periodStart, weekEnd: currentWeek.periodEnd, compareWeekStart: null };
    }
    const compareExists = compareTable ? await this.tableExists(compareTable) : false;
    const isWideTable = await this.columnExists(currentTable, "product1_asin");
    if (isWideTable) {
      return this.searchWideTermsFast({
        query,
        page,
        pageSize,
        currentTable,
        compareTable: compareExists ? compareTable : null,
        currentWeek,
        compareWeek: compareExists ? compareWeek : null,
        excludedKeywords,
        visibleLimit
      });
    }

    const preWhere: string[] = [];
    const preParams: unknown[] = [];
    const where: string[] = [];
    const params: unknown[] = [];
    const addPre = (value: unknown) => {
      preParams.push(value);
      return "?";
    };
    const add = (value: unknown) => {
      params.push(value);
      return "?";
    };
    const hasFastNarrowingFilter = Boolean(
      query.keyword?.trim() ||
        excludedKeywords.length ||
        query.rankMin ||
        query.rankMax ||
        query.asin?.trim()
    );
    if (!hasFastNarrowingFilter) {
      throw new BadRequestException("旧周报数据量较大，请先输入关键词、ASIN 或排名范围后再查询。");
    }

    if (query.keyword?.trim()) preWhere.push(`search_term LIKE ${addPre(`${query.keyword.trim()}%`)}`);
    for (const excludedKeyword of excludedKeywords) {
      preWhere.push(`LOWER(search_term) NOT LIKE ${addPre(`%${excludedKeyword}%`)}`);
    }
    if (query.rankMin) preWhere.push(`search_frequency_rank >= ${addPre(Number(query.rankMin))}`);
    if (query.rankMax) preWhere.push(`search_frequency_rank <= ${addPre(Number(query.rankMax))}`);
    if (query.asin?.trim()) {
      preWhere.push(`LOWER(clicked_asin) = LOWER(${addPre(query.asin.trim())})`);
    }
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
    const requestedChangeType = query.changeType && query.changeType !== "all" ? query.changeType : null;
    const requestedSort = query.sort ?? "rank";
    if (requestedChangeType && !compareExists) {
      return { rows: [], page, pageSize, total: 0, weekStart: currentWeek.periodStart, weekEnd: currentWeek.periodEnd, compareWeekStart: null };
    }
    if (requestedSort === "rankChange" && !compareExists) {
      throw new BadRequestException("排名变化排序需要先选择有效的对比周。");
    }
    const sort = sortMap[requestedSort] ?? sortMap.rank;
    const order = query.order ? (query.order === "desc" ? "DESC" : "ASC") : defaultSortOrder(requestedSort, requestedChangeType);
    const preWhereSql = preWhere.length ? `WHERE ${preWhere.join(" AND ")}` : "";
    const baseSql = this.baseSql(currentTable, compareExists ? compareTable : null, isWideTable, preWhereSql);
    const topProductsSql = isWideTable ? this.wideTopProductsSql() : this.narrowTopProductsSql(currentTable);
    const hasKeywordExplanations = await this.plainTableExists("aba_keyword_explanations");
    const metadataJoinSql = hasKeywordExplanations
      ? "LEFT JOIN `aba_keyword_explanations` ke ON ke.search_term = base.search_term"
      : "";
    const keywordExplanationSql = hasKeywordExplanations ? "ke.cn_explanation" : "NULL";

    const queryParams = [...preParams, ...params];
    const countRows = await this.mysql.query<CountRow>(`${baseSql} SELECT COUNT(*) AS total FROM base ${whereSql}`, queryParams);
    const total = clampVisibleTotal(Number(countRows[0]?.total ?? 0), visibleLimit);

    const dataRows = await this.mysql.query<SearchRow>(
      `${baseSql}
       SELECT
         base.search_term,
         ${keywordExplanationSql} AS keyword_cn_explanation,
         base.department_name,
         base.current_rank,
         base.compare_rank,
         base.rank_change,
         base.change_type,
         ${topProductsSql} AS top_products
       FROM base
       ${metadataJoinSql}
       ${whereSql}
       ORDER BY ${sort} ${order}, base.search_term ASC
       LIMIT ? OFFSET ?`,
      [...queryParams, pageSize, (page - 1) * pageSize]
    );

    const rows: AbaSearchTermRow[] = dataRows.map((row) => ({
      keyword: row.search_term,
      keywordCnExplanation: row.keyword_cn_explanation,
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

  private async plainTableExists(tableName: string) {
    if (!/^[a-z0-9_]+$/.test(tableName)) return false;
    const database = process.env.MYSQL_DATABASE ?? "lingxing";
    const rows = await this.mysql.query<RowDataPacket>(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = ? LIMIT 1",
      [database, tableName]
    );
    return rows.length > 0;
  }

  private async columnExists(tableName: string, columnName: string) {
    if (!isSafeAbaTableName(tableName)) return false;
    const database = process.env.MYSQL_DATABASE ?? "lingxing";
    const rows = await this.mysql.query<RowDataPacket>(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = ? AND table_name = ? AND column_name = ?
       LIMIT 1`,
      [database, tableName, columnName]
    );
    return rows.length > 0;
  }

  private async columnHasAnyValue(tableName: string, columnName: string) {
    if (!isSafeAbaTableName(tableName) || !/^[a-z0-9_]+$/.test(columnName)) return false;
    const rows = await this.mysql.query<RowDataPacket>(
      `SELECT 1 FROM ${quoteIdentifier(tableName)} WHERE \`${columnName}\` IS NOT NULL LIMIT 1`
    );
    return rows.length > 0;
  }

  private async indexExists(tableName: string, indexName: string) {
    if (!isSafeAbaTableName(tableName) || !/^[a-z0-9_]+$/.test(indexName)) return false;
    const database = process.env.MYSQL_DATABASE ?? "lingxing";
    const rows = await this.mysql.query<RowDataPacket>(
      `SELECT 1
       FROM information_schema.statistics
       WHERE table_schema = ? AND table_name = ? AND index_name = ?
       LIMIT 1`,
      [database, tableName, indexName]
    );
    return rows.length > 0;
  }

  private async searchWideTermsFast({
    query,
    page,
    pageSize,
    currentTable,
    compareTable,
    currentWeek,
    compareWeek,
    excludedKeywords,
    visibleLimit
  }: {
    query: AbaSearchQuery;
    page: number;
    pageSize: number;
    currentTable: string;
    compareTable: string | null;
    currentWeek: AbaWeek;
    compareWeek: AbaWeek | null;
    excludedKeywords: string[];
    visibleLimit: number | null;
  }): Promise<AbaSearchTermsResponse> {
    const current = quoteIdentifier(currentTable);
    const compare = compareTable ? quoteIdentifier(compareTable) : null;
    const requestedChangeType = query.changeType && query.changeType !== "all" ? query.changeType : null;
    const shouldJoinCompare = Boolean(compare && (query.sort === "rankChange" || requestedChangeType));
    const hasNarrowingFilter = Boolean(
      query.keyword?.trim() ||
        excludedKeywords.length ||
        query.rankMin ||
        query.rankMax ||
        query.asin?.trim() ||
        query.clickShareMin ||
        query.clickShareMax ||
        query.conversionShareMin ||
        query.conversionShareMax
    );
    if (query.sort === "rankChange" && !requestedChangeType && !hasNarrowingFilter) {
      throw new BadRequestException("请先选择变化类型或输入关键词后再按排名变化排序。");
    }
    const params: unknown[] = [];
    const where: string[] = [];
    const add = (value: unknown) => {
      params.push(value);
      return "?";
    };
    const maxClickShare =
      "GREATEST(COALESCE(c.product1_click_share, 0), COALESCE(c.product2_click_share, 0), COALESCE(c.product3_click_share, 0))";
    const maxConversionShare =
      "GREATEST(COALESCE(c.product1_conversion_share, 0), COALESCE(c.product2_conversion_share, 0), COALESCE(c.product3_conversion_share, 0))";

    if (query.keyword?.trim()) where.push(`LOWER(c.search_term) LIKE LOWER(${add(`%${query.keyword.trim()}%`)})`);
    for (const excludedKeyword of excludedKeywords) {
      where.push(`LOWER(c.search_term) NOT LIKE ${add(`%${excludedKeyword}%`)}`);
    }
    if (query.rankMin) where.push(`c.search_frequency_rank >= ${add(Number(query.rankMin))}`);
    if (query.rankMax) where.push(`c.search_frequency_rank <= ${add(Number(query.rankMax))}`);
    if (query.asin?.trim()) {
      const asin = query.asin.trim().toUpperCase();
      where.push(
        `(c.product1_asin = ${add(asin)}
          OR c.product2_asin = ${add(asin)}
          OR c.product3_asin = ${add(asin)})`
      );
    }
    if (query.clickShareMin) where.push(`${maxClickShare} >= ${add(Number(query.clickShareMin) / 100)}`);
    if (query.clickShareMax) where.push(`${maxClickShare} <= ${add(Number(query.clickShareMax) / 100)}`);
    if (query.conversionShareMin) where.push(`${maxConversionShare} >= ${add(Number(query.conversionShareMin) / 100)}`);
    if (query.conversionShareMax) where.push(`${maxConversionShare} <= ${add(Number(query.conversionShareMax) / 100)}`);
    if (requestedChangeType) {
      if (!compare) {
        return { rows: [], page, pageSize, total: 0, weekStart: currentWeek.periodStart, weekEnd: currentWeek.periodEnd, compareWeekStart: null };
      }
      const changeSql = {
        new: `NOT EXISTS (SELECT 1 FROM ${compare} p WHERE p.search_term = c.search_term)`,
        up: `EXISTS (SELECT 1 FROM ${compare} p WHERE p.search_term = c.search_term AND c.search_frequency_rank < p.search_frequency_rank)`,
        down: `EXISTS (SELECT 1 FROM ${compare} p WHERE p.search_term = c.search_term AND c.search_frequency_rank > p.search_frequency_rank)`,
        flat: `EXISTS (SELECT 1 FROM ${compare} p WHERE p.search_term = c.search_term AND c.search_frequency_rank = p.search_frequency_rank)`,
        lost: "FALSE"
      } satisfies Record<ChangeType, string>;
      where.push(changeSql[requestedChangeType]);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const fromSql = shouldJoinCompare
      ? `${current} c LEFT JOIN ${compare} p ON p.search_term = c.search_term`
      : `${current} c`;
    const sortMap = {
      rank: "c.search_frequency_rank",
      rankChange: shouldJoinCompare ? "(p.search_frequency_rank - c.search_frequency_rank)" : "c.search_frequency_rank",
      clickShare: "max_click_share",
      conversionShare: "max_conversion_share",
      keyword: "c.search_term"
    } satisfies Record<NonNullable<AbaSearchQuery["sort"]>, string>;
    const requestedSort = query.sort ?? "rank";
    const sort = sortMap[requestedSort] ?? sortMap.rank;
    const order = query.order ? (query.order === "desc" ? "DESC" : "ASC") : defaultSortOrder(requestedSort, requestedChangeType);
    const canUseRowNo =
      requestedSort === "rank" &&
      order === "ASC" &&
      where.length === 0 &&
      !shouldJoinCompare &&
      (await this.columnExists(currentTable, "row_no")) &&
      (await this.indexExists(currentTable, "idx_row_no"));
    const canUseIdRange =
      requestedSort === "rank" &&
      order === "ASC" &&
      where.length === 0 &&
      !shouldJoinCompare &&
      !canUseRowNo;

    const useApproximateTotal = requestedChangeType === "lost";
    const rawTotal = useApproximateTotal
      ? Number(currentWeek.totalTerms ?? 0)
      : where.length
        ? await this.filteredTotalCount({
            cacheKey: this.filteredTotalCacheKey({
              currentTable,
              compareTable,
              fromSql,
              whereSql,
              params
            }),
            sql: `SELECT COUNT(*) AS total FROM ${fromSql} ${whereSql}`,
            params
          })
        : await this.exactTableCount(currentTable);
    const total = clampVisibleTotal(rawTotal, visibleLimit);
    const compareRankSelect = shouldJoinCompare ? "p.search_frequency_rank" : "NULL";

    const selectSql = `SELECT
       c.search_term,
       c.department_name,
       c.search_frequency_rank AS current_rank,
       ${compareRankSelect} AS compare_rank,
       ${maxClickShare} AS max_click_share,
       ${maxConversionShare} AS max_conversion_share,
       c.product1_asin,
       c.product1_item_name,
       c.product1_click_share,
       c.product1_conversion_share,
       c.product2_asin,
       c.product2_item_name,
       c.product2_click_share,
       c.product2_conversion_share,
       c.product3_asin,
       c.product3_item_name,
       c.product3_click_share,
       c.product3_conversion_share`;
    const rows = canUseRowNo
      ? await this.mysql.query<WidePageRow>(
          `${selectSql}
           FROM ${current} c
           WHERE c.row_no BETWEEN ? AND ?
           ORDER BY c.row_no ASC`,
          [(page - 1) * pageSize + 1, page * pageSize]
        )
      : canUseIdRange
        ? await this.mysql.query<WidePageRow>(
            `${selectSql}
             FROM ${current} c
             WHERE c.id >= ?
             ORDER BY c.id ASC
             LIMIT ?`,
            [(page - 1) * pageSize + 1, pageSize]
          )
      : await this.mysql.query<WidePageRow>(
          `${selectSql}
           FROM ${fromSql}
           ${whereSql}
           ORDER BY ${sort} ${order}, c.search_term ASC
           LIMIT ? OFFSET ?`,
          [...params, pageSize, (page - 1) * pageSize]
        );

    const compareRanks =
      compareTable && !shouldJoinCompare && rows.length
        ? await this.fetchCompareRanks(compareTable, rows.map((row) => row.search_term))
        : new Map<string, number>();
    const [explanations, asinAssets] = await Promise.all([
      this.fetchKeywordExplanations(rows.map((row) => row.search_term)),
      this.fetchAsinAssets(rows.flatMap((row) => [row.product1_asin, row.product2_asin, row.product3_asin]))
    ]);

    return {
      rows: rows.map((row) => {
        const compareRank =
          shouldJoinCompare || requestedChangeType ? nullableNumber(row.compare_rank) : compareRanks.get(row.search_term) ?? null;
        const currentRank = nullableNumber(row.current_rank);
        return {
          keyword: row.search_term,
          keywordCnExplanation: explanations.get(row.search_term) ?? null,
          departmentName: row.department_name,
          currentRank,
          compareRank,
          rankChange: currentRank !== null && compareRank !== null ? compareRank - currentRank : null,
          changeType: changeTypeFor(currentRank, compareRank),
          topProducts: wideProducts(row, asinAssets)
        };
      }),
      page,
      pageSize,
      total,
      weekStart: currentWeek.periodStart,
      weekEnd: currentWeek.periodEnd,
      compareWeekStart: compareTable ? compareWeek?.periodStart ?? null : null
    };
  }

  private async fetchCompareRanks(compareTable: string, terms: string[]) {
    const uniqueTerms = [...new Set(terms)];
    const placeholders = uniqueTerms.map(() => "?").join(", ");
    const rows = await this.mysql.query<CompareRankRow>(
      `SELECT search_term, search_frequency_rank AS compare_rank
       FROM ${quoteIdentifier(compareTable)}
       WHERE search_term IN (${placeholders})`,
      uniqueTerms
    );
    return new Map(rows.map((row) => [row.search_term, Number(row.compare_rank)]));
  }

  private async exactTableCount(tableName: string) {
    if (!isSafeAbaTableName(tableName)) return 0;
    const cached = this.exactTableCountCache.get(tableName);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.total;

    const rows = await this.mysql.query<CountRow>(`SELECT COUNT(*) AS total FROM ${quoteIdentifier(tableName)}`);
    const total = Number(rows[0]?.total ?? 0);
    this.exactTableCountCache.set(tableName, { total, expiresAt: now + 5 * 60 * 1000 });
    return total;
  }

  private filteredTotalCacheKey({
    currentTable,
    compareTable,
    fromSql,
    whereSql,
    params
  }: {
    currentTable: string;
    compareTable: string | null;
    fromSql: string;
    whereSql: string;
    params: unknown[];
  }) {
    return JSON.stringify({
      currentTable,
      compareTable,
      fromSql,
      whereSql,
      params
    });
  }

  private async filteredTotalCount({ cacheKey, sql, params }: { cacheKey: string; sql: string; params: unknown[] }) {
    const now = Date.now();
    const cached = this.filteredTotalCache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.total;

    const rows = await this.mysql.query<CountRow>(sql, params);
    const total = Number(rows[0]?.total ?? 0);
    this.filteredTotalCache.set(cacheKey, { total, expiresAt: now + 5 * 60 * 1000 });

    if (this.filteredTotalCache.size > 200) {
      for (const [key, value] of this.filteredTotalCache) {
        if (value.expiresAt <= now) this.filteredTotalCache.delete(key);
      }
    }

    return total;
  }

  private async fetchKeywordExplanations(terms: string[]) {
    const uniqueTerms = [...new Set(terms.filter(Boolean))];
    if (!uniqueTerms.length || !(await this.plainTableExists("aba_keyword_explanations"))) return new Map<string, string>();
    const placeholders = uniqueTerms.map(() => "?").join(", ");
    const rows = await this.mysql.query<KeywordExplanationRow>(
      `SELECT search_term, cn_explanation
       FROM \`aba_keyword_explanations\`
       WHERE search_term IN (${placeholders})`,
      uniqueTerms
    );
    return new Map(rows.filter((row) => row.cn_explanation).map((row) => [row.search_term, String(row.cn_explanation)]));
  }

  private async fetchAsinAssets(asins: Array<string | null>) {
    const uniqueAsins = [...new Set(asins.map((asin) => asin?.trim().toUpperCase()).filter(Boolean) as string[])];
    if (!uniqueAsins.length || !(await this.plainTableExists("aba_asin_assets"))) return new Map<string, AsinAsset>();
    const placeholders = uniqueAsins.map(() => "?").join(", ");
    const rows = await this.mysql.query<AsinAssetRow>(
      `SELECT asin, image_url, price, rating, review_count, detail_url
       FROM \`aba_asin_assets\`
       WHERE asin IN (${placeholders})`,
      uniqueAsins
    );
    return new Map(
      rows.map((row) => [
        row.asin,
        {
          imageUrl: row.image_url ? String(row.image_url) : null,
          price: nullableNumber(row.price),
          rating: nullableNumber(row.rating),
          reviewCount: nullableNumber(row.review_count),
          detailUrl: row.detail_url ? String(row.detail_url) : null
        }
      ])
    );
  }

  private baseSql(currentTable: string, compareTable: string | null, isWideTable: boolean, currentWhereSql = "") {
    const current = quoteIdentifier(currentTable);
    const compareJoin = compareTable
      ? `LEFT JOIN (
           SELECT search_term, MIN(search_frequency_rank) AS compare_rank
           FROM ${quoteIdentifier(compareTable)}
           GROUP BY search_term
         ) p ON ${sameTextExpression("p.search_term", "c.search_term")}`
      : "LEFT JOIN (SELECT NULL AS search_term, NULL AS compare_rank) p ON FALSE";

    return `
      WITH c AS (
        SELECT
          search_term,
          MIN(search_frequency_rank) AS current_rank,
          MIN(department_name) AS department_name,
          ${isWideTable ? "MAX(GREATEST(COALESCE(product1_click_share, 0), COALESCE(product2_click_share, 0), COALESCE(product3_click_share, 0)))" : "MAX(click_share)"} AS max_click_share,
          ${isWideTable ? "MAX(GREATEST(COALESCE(product1_conversion_share, 0), COALESCE(product2_conversion_share, 0), COALESCE(product3_conversion_share, 0)))" : "MAX(conversion_share)"} AS max_conversion_share
          ${isWideTable ? `,
          MIN(product1_asin) AS product1_asin,
          MIN(product1_item_name) AS product1_item_name,
          MAX(product1_click_share) AS product1_click_share,
          MAX(product1_conversion_share) AS product1_conversion_share,
          MIN(product2_asin) AS product2_asin,
          MIN(product2_item_name) AS product2_item_name,
          MAX(product2_click_share) AS product2_click_share,
          MAX(product2_conversion_share) AS product2_conversion_share,
          MIN(product3_asin) AS product3_asin,
          MIN(product3_item_name) AS product3_item_name,
          MAX(product3_click_share) AS product3_click_share,
          MAX(product3_conversion_share) AS product3_conversion_share` : ""}
        FROM ${current}
        ${currentWhereSql}
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
          ${isWideTable ? `,
          c.product1_asin,
          c.product1_item_name,
          c.product1_click_share,
          c.product1_conversion_share,
          c.product2_asin,
          c.product2_item_name,
          c.product2_click_share,
          c.product2_conversion_share,
          c.product3_asin,
          c.product3_item_name,
          c.product3_click_share,
          c.product3_conversion_share` : ""}
        FROM c
        ${compareJoin}
      )`;
  }

  private wideTopProductsSql() {
    return `JSON_ARRAY(
      JSON_OBJECT('asin', base.product1_asin, 'itemName', base.product1_item_name, 'clickShareRank', 1, 'clickShare', base.product1_click_share, 'conversionShare', base.product1_conversion_share),
      JSON_OBJECT('asin', base.product2_asin, 'itemName', base.product2_item_name, 'clickShareRank', 2, 'clickShare', base.product2_click_share, 'conversionShare', base.product2_conversion_share),
      JSON_OBJECT('asin', base.product3_asin, 'itemName', base.product3_item_name, 'clickShareRank', 3, 'clickShare', base.product3_click_share, 'conversionShare', base.product3_conversion_share)
    )`;
  }

  private narrowTopProductsSql(currentTable: string) {
    return `COALESCE((
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
    ), JSON_ARRAY())`;
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

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampVisibleTotal(total: number, visibleLimit: number | null) {
  if (visibleLimit === null) return total;
  return Math.min(total, visibleLimit);
}

function parseExcludedKeywords(value: string | undefined) {
  if (!value?.trim()) return [];

  const keywords = [...new Set(value.split("&").map((item) => item.trim().toLowerCase()).filter(Boolean))];
  if (keywords.length > 20) {
    throw new BadRequestException("排除关键词最多支持 20 个，请减少后重试。");
  }
  return keywords;
}

function defaultSortOrder(sort: NonNullable<AbaSearchQuery["sort"]>, changeType: ChangeType | null) {
  if (sort === "clickShare" || sort === "conversionShare") return "DESC";
  if (sort === "rankChange") return changeType === "down" ? "ASC" : "DESC";
  return "ASC";
}

function changeTypeFor(currentRank: number | null, compareRank: number | null): ChangeType {
  if (compareRank === null) return "new";
  if (currentRank === null) return "lost";
  if (currentRank < compareRank) return "up";
  if (currentRank > compareRank) return "down";
  return "flat";
}

function wideProducts(row: WidePageRow, asinAssets = new Map<string, AsinAsset>()): AbaTopProduct[] {
  return [
    {
      asin: row.product1_asin,
      itemName: row.product1_item_name,
      clickShareRank: 1,
      clickShare: nullableNumber(row.product1_click_share),
      conversionShare: nullableNumber(row.product1_conversion_share),
      ...assetForAsin(asinAssets, row.product1_asin)
    },
    {
      asin: row.product2_asin,
      itemName: row.product2_item_name,
      clickShareRank: 2,
      clickShare: nullableNumber(row.product2_click_share),
      conversionShare: nullableNumber(row.product2_conversion_share),
      ...assetForAsin(asinAssets, row.product2_asin)
    },
    {
      asin: row.product3_asin,
      itemName: row.product3_item_name,
      clickShareRank: 3,
      clickShare: nullableNumber(row.product3_click_share),
      conversionShare: nullableNumber(row.product3_conversion_share),
      ...assetForAsin(asinAssets, row.product3_asin)
    }
  ].filter((product) => product.asin || product.itemName);
}

function assetForAsin(asinAssets: Map<string, AsinAsset>, asin: string | null) {
  const normalized = asin?.trim().toUpperCase();
  const asset = normalized ? asinAssets.get(normalized) : null;
  return {
    imageUrl: asset?.imageUrl ?? null,
    price: asset?.price ?? null,
    rating: asset?.rating ?? null,
    reviewCount: asset?.reviewCount ?? null,
    detailUrl: asset?.detailUrl ?? (normalized ? `https://www.amazon.com/dp/${encodeURIComponent(normalized)}?psc=1` : null)
  };
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

function sameTextExpression(left: string, right: string) {
  return `${left} COLLATE utf8mb4_unicode_ci = ${right} COLLATE utf8mb4_unicode_ci`;
}
