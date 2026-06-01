import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import csv from "csv-parser";
import { Redis } from "ioredis";
import { createReadStream } from "node:fs";
import { mkdir, open, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import XLSX from "xlsx";
import { normalizeKeyword, normalizeRank } from "@aba/shared";
import { DatabaseService } from "../db/database.service.js";

const require = createRequire(import.meta.url);
const { parser } = require("stream-json") as typeof import("stream-json");
const { pick } = require("stream-json/filters/Pick.js") as typeof import("stream-json/filters/Pick.js");
const { streamArray } = require("stream-json/streamers/StreamArray.js") as typeof import("stream-json/streamers/StreamArray.js");

interface ImportJob {
  taskId: number;
  filePath: string;
  reportDate: string;
}

interface AbaRawRecord {
  departmentName?: unknown;
  searchTerm?: unknown;
  searchFrequencyRank?: unknown;
  clickedAsin?: unknown;
  clickedItemName?: unknown;
  clickShareRank?: unknown;
  clickShare?: unknown;
  conversionShare?: unknown;
}

interface AbaWeeklyReportMeta {
  periodStart: string;
  periodEnd: string;
  marketplaceId: string;
  reportPeriod: string;
}

interface AbaTermRow {
  keyword: string;
  rank: number;
  departmentName: string | null;
}

interface AbaProductRow {
  keyword: string;
  clickedAsin: string | null;
  clickedItemName: string | null;
  clickShareRank: number | null;
  clickShare: number | null;
  conversionShare: number | null;
}

@Injectable()
export class ImportService implements OnModuleDestroy {
  private readonly logger = new Logger(ImportService.name);
  private readonly uploadDir = process.env.UPLOAD_DIR ?? "uploads";
  private readonly redisUrl = process.env.REDIS_URL;
  private readonly connection: Redis | null = this.redisUrl ? new Redis(this.redisUrl, { maxRetriesPerRequest: null }) : null;
  private readonly queue: Queue<ImportJob> | null = this.connection ? new Queue<ImportJob>("aba-import", { connection: this.connection }) : null;
  private readonly worker: Worker<ImportJob> | null = this.connection
    ? new Worker<ImportJob>("aba-import", (job) => this.process(job.data), { connection: this.connection })
    : null;

  constructor(private readonly db: DatabaseService) {
    this.connection?.on("error", (error) => this.logger.warn(`Redis connection unavailable: ${error.message}`));
    this.queue?.on("error", (error) => this.logger.warn(`Import queue unavailable: ${error.message}`));
    this.worker?.on("error", (error) => this.logger.warn(`Import worker unavailable: ${error.message}`));
  }

  async onModuleDestroy() {
    await this.worker?.close().catch(() => undefined);
    await this.queue?.close().catch(() => undefined);
    await this.connection?.quit().catch(() => undefined);
  }

  async createTask(fileName: string, reportDate: string) {
    const result = await this.db.query<{ id: string; status: string }>(
      "INSERT INTO import_task (file_name, report_date, status) VALUES ($1, $2, 'pending') RETURNING id, status",
      [fileName, reportDate]
    );
    return { taskId: Number(result.rows[0].id), status: result.rows[0].status };
  }

  async upload(file: Express.Multer.File, reportDate: string) {
    const task = await this.createTask(file.originalname, reportDate);
    await this.db.query("UPDATE import_task SET status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [task.taskId]);
    if (this.queue) {
      await this.queue.add("process", { taskId: task.taskId, filePath: file.path, reportDate });
    } else {
      this.process({ taskId: task.taskId, filePath: file.path, reportDate }).catch((error) =>
        this.logger.error(`Inline import task ${task.taskId} failed`, error instanceof Error ? error.stack : undefined)
      );
    }
    return { ...task, status: "processing" };
  }

  async getTask(taskId: number) {
    const result = await this.db.query(
      `SELECT id, file_name, report_date::text, total_rows, processed_rows, success_rows, failed_rows, duplicate_rows,
              status, error_message, created_at, finished_at
       FROM import_task WHERE id = $1`,
      [taskId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      taskId: Number(row.id),
      fileName: row.file_name,
      reportDate: row.report_date,
      totalRows: Number(row.total_rows),
      processedRows: Number(row.processed_rows),
      successRows: Number(row.success_rows),
      failedRows: Number(row.failed_rows),
      duplicateRows: Number(row.duplicate_rows),
      status: row.status,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      finishedAt: row.finished_at
    };
  }

  async ensureUploadDir() {
    await mkdir(this.uploadDir, { recursive: true });
    return this.uploadDir;
  }

  uploadPath(fileName: string) {
    return join(this.uploadDir, fileName);
  }

  private async process(job: ImportJob) {
    const extension = extname(job.filePath).toLowerCase();
    const isWeeklyAbaJson = extension === ".json" && (await this.looksLikeWeeklyAbaJson(job.filePath));
    if (isWeeklyAbaJson) {
      await this.processWeeklyAbaJson(job);
      return;
    }

    let batch: Array<{ keyword: string; rank: number }> = [];
    const stats = { total: 0, success: 0, failed: 0, duplicate: 0 };
    const flush = async () => {
      if (!batch.length) return;
      const result = await this.upsertBatch(batch, job.reportDate);
      stats.success += result.success;
      stats.duplicate += result.duplicate;
      batch = [];
      await this.updateProgress(job.taskId, stats);
    };

    try {
      await this.consumeFile(job.filePath, async (record) => {
        stats.total += 1;
        const keyword = normalizeKeyword(record.searchTerm ?? record.keyword);
        const rank = normalizeRank(record.searchFrequencyRank ?? record.rank ?? record.rank_num);
        if (!keyword || !rank || !job.reportDate) {
          stats.failed += 1;
          return;
        }
        batch.push({ keyword, rank });
        if (batch.length >= 5000) await flush();
      });
      await flush();
      await this.refreshProfiles(job.reportDate);
      await this.db.query(
        `UPDATE import_task SET total_rows = $2, processed_rows = $2, success_rows = $3, failed_rows = $4,
         duplicate_rows = $5, status = 'success', updated_at = CURRENT_TIMESTAMP, finished_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [job.taskId, stats.total, stats.success, stats.failed, stats.duplicate]
      );
    } catch (error) {
      await this.db.query(
        "UPDATE import_task SET status = 'failed', error_message = $2, updated_at = CURRENT_TIMESTAMP, finished_at = CURRENT_TIMESTAMP WHERE id = $1",
        [job.taskId, error instanceof Error ? error.message : String(error)]
      );
      throw error;
    } finally {
      await rm(job.filePath, { force: true }).catch(() => undefined);
    }
  }

  private async consumeFile(filePath: string, onRecord: (record: any) => Promise<void>) {
    const extension = extname(filePath).toLowerCase();
    if (extension === ".csv") {
      await (pipeline as any)(createReadStream(filePath), csv(), async function* (source: AsyncIterable<any>) {
        for await (const record of source) {
          await onRecord(record);
        }
      });
      return;
    }
    if (extension === ".json") {
      await (pipeline as any)(createReadStream(filePath), parser(), streamArray(), async function* (source: AsyncIterable<{ value: unknown }>) {
        for await (const { value } of source) {
          await onRecord(value);
        }
      });
      return;
    }
    if (extension === ".xlsx" || extension === ".xls") {
      const workbook = XLSX.readFile(filePath, { dense: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet);
      for (const row of rows) await onRecord(row);
      return;
    }
    throw new Error(`Unsupported file type: ${extension}`);
  }

  private async processWeeklyAbaJson(job: ImportJob) {
    const meta = await this.readWeeklyReportMeta(job.filePath, job.reportDate);
    const reportId = await this.upsertWeeklyReport(meta);
    let terms: AbaTermRow[] = [];
    let products: AbaProductRow[] = [];
    const stats = { total: 0, success: 0, failed: 0, duplicate: 0 };

    const flush = async () => {
      if (!terms.length && !products.length) return;
      const result = await this.upsertWeeklyBatch(reportId, meta, terms, products);
      stats.success += result.success;
      stats.duplicate += result.duplicate;
      terms = [];
      products = [];
      await this.updateProgress(job.taskId, stats);
    };

    try {
      await this.consumeWeeklyAbaRecords(job.filePath, async (record) => {
        stats.total += 1;
        const keyword = normalizeKeyword(record.searchTerm);
        const rank = normalizeRank(record.searchFrequencyRank);
        if (!keyword || !rank) {
          stats.failed += 1;
          return;
        }

        terms.push({
          keyword,
          rank,
          departmentName: normalizeNullableString(record.departmentName)
        });
        products.push({
          keyword,
          clickedAsin: normalizeNullableString(record.clickedAsin),
          clickedItemName: normalizeNullableString(record.clickedItemName),
          clickShareRank: normalizeNullableInt(record.clickShareRank),
          clickShare: normalizeNullableNumber(record.clickShare),
          conversionShare: normalizeNullableNumber(record.conversionShare)
        });
        if (products.length >= 5000) await flush();
      });

      await flush();
      await this.db.query(
        `UPDATE import_task SET report_date = $2, total_rows = $3, processed_rows = $3, success_rows = $4, failed_rows = $5,
         duplicate_rows = $6, status = 'success', updated_at = CURRENT_TIMESTAMP, finished_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [job.taskId, meta.periodStart, stats.total, stats.success, stats.failed, stats.duplicate]
      );
    } catch (error) {
      await this.db.query(
        "UPDATE import_task SET status = 'failed', error_message = $2, updated_at = CURRENT_TIMESTAMP, finished_at = CURRENT_TIMESTAMP WHERE id = $1",
        [job.taskId, error instanceof Error ? error.message : String(error)]
      );
      throw error;
    } finally {
      await rm(job.filePath, { force: true }).catch(() => undefined);
    }
  }

  private async consumeWeeklyAbaRecords(filePath: string, onRecord: (record: AbaRawRecord) => Promise<void>) {
    await (pipeline as any)(
      createReadStream(filePath),
      parser(),
      pick({ filter: "dataByDepartmentAndSearchTerm" }),
      streamArray(),
      async function* (source: AsyncIterable<{ value: AbaRawRecord }>) {
        for await (const { value } of source) {
          await onRecord(value);
        }
      }
    );
  }

  private async looksLikeWeeklyAbaJson(filePath: string) {
    const handle = await open(filePath, "r");
    try {
      const buffer = Buffer.alloc(256 * 1024);
      const result = await handle.read(buffer, 0, buffer.length, 0);
      const head = buffer.subarray(0, result.bytesRead).toString("utf8");
      return head.includes("reportSpecification") && head.includes("dataByDepartmentAndSearchTerm");
    } finally {
      await handle.close();
    }
  }

  private async readWeeklyReportMeta(filePath: string, fallbackDate: string): Promise<AbaWeeklyReportMeta> {
    const handle = await open(filePath, "r");
    try {
      const buffer = Buffer.alloc(1024 * 1024);
      const result = await handle.read(buffer, 0, buffer.length, 0);
      const head = buffer.subarray(0, result.bytesRead).toString("utf8");
      const periodStart = matchJsonString(head, "dataStartTime") ?? fallbackDate;
      const periodEnd = matchJsonString(head, "dataEndTime") ?? fallbackDate;
      const reportPeriod = matchJsonString(head, "reportPeriod") ?? "WEEK";
      const marketplaceId = matchMarketplaceId(head) ?? "ATVPDKIKX0DER";
      if (!periodStart || !periodEnd) throw new Error("Weekly ABA JSON is missing reportSpecification.dataStartTime/dataEndTime");
      return { periodStart, periodEnd, marketplaceId, reportPeriod };
    } finally {
      await handle.close();
    }
  }

  private async upsertWeeklyReport(meta: AbaWeeklyReportMeta) {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO aba_weekly_report (marketplace_id, period_start, period_end, report_period, source, updated_at)
       VALUES ($1, $2, $3, $4, 'crawler', CURRENT_TIMESTAMP)
       ON CONFLICT (marketplace_id, period_start, period_end) DO UPDATE SET
         report_period = EXCLUDED.report_period,
         updated_at = CURRENT_TIMESTAMP
       RETURNING id`,
      [meta.marketplaceId, meta.periodStart, meta.periodEnd, meta.reportPeriod]
    );
    return Number(result.rows[0].id);
  }

  private async upsertWeeklyBatch(reportId: number, meta: AbaWeeklyReportMeta, terms: AbaTermRow[], products: AbaProductRow[]) {
    const uniqueTerms = [...new Map(terms.map((term) => [term.keyword, term])).values()];
    if (uniqueTerms.length) {
      const termValues: unknown[] = [];
      const termPlaceholders = uniqueTerms
        .map((term, index) => {
          const offset = index * 7;
          termValues.push(reportId, meta.marketplaceId, meta.periodStart, meta.periodEnd, term.departmentName, term.keyword, term.rank);
          return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`;
        })
        .join(",");
      await this.db.query(
        `INSERT INTO aba_search_term_weekly
          (report_id, marketplace_id, period_start, period_end, department_name, search_term, search_frequency_rank)
         VALUES ${termPlaceholders}
         ON CONFLICT (report_id, search_term) DO UPDATE SET
           department_name = EXCLUDED.department_name,
           search_frequency_rank = EXCLUDED.search_frequency_rank,
           updated_at = CURRENT_TIMESTAMP`,
        termValues
      );
    }

    const validProducts = products.filter((product) => product.clickedAsin || product.clickShareRank !== null);
    if (validProducts.length) {
      const productValues: unknown[] = [];
      const productPlaceholders = validProducts
        .map((product, index) => {
          const offset = index * 7;
          productValues.push(
            reportId,
            product.keyword,
            product.clickedAsin,
            product.clickedItemName,
            product.clickShareRank,
            product.clickShare,
            product.conversionShare
          );
          return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`;
        })
        .join(",");
      await this.db.query(
        `INSERT INTO aba_search_term_product
          (report_id, search_term, clicked_asin, clicked_item_name, click_share_rank, click_share, conversion_share)
         VALUES ${productPlaceholders}
         ON CONFLICT (report_id, search_term, click_share_rank, clicked_asin) DO UPDATE SET
           clicked_item_name = EXCLUDED.clicked_item_name,
           click_share = EXCLUDED.click_share,
           conversion_share = EXCLUDED.conversion_share,
           updated_at = CURRENT_TIMESTAMP`,
        productValues
      );
    }

    return { success: products.length, duplicate: Math.max(0, terms.length - uniqueTerms.length) };
  }

  private async upsertBatch(rows: Array<{ keyword: string; rank: number }>, reportDate: string) {
    const values: unknown[] = [];
    const placeholders = rows
      .map((row, index) => {
        const offset = index * 3;
        values.push(row.keyword, row.rank, reportDate);
        return `($${offset + 1}, $${offset + 2}, $${offset + 3})`;
      })
      .join(",");
    const result = await this.db.query(
      `INSERT INTO aba_keyword_daily (keyword, rank_num, report_date)
       VALUES ${placeholders}
       ON CONFLICT (keyword, report_date) DO UPDATE SET rank_num = EXCLUDED.rank_num, updated_at = CURRENT_TIMESTAMP
       RETURNING (xmax <> 0) AS updated`,
      values
    );
    const duplicate = result.rows.filter((row) => row.updated).length;
    return { success: rows.length, duplicate };
  }

  private async updateProgress(taskId: number, stats: { total: number; success: number; failed: number; duplicate: number }) {
    await this.db.query(
      `UPDATE import_task SET total_rows = $2, processed_rows = $2, success_rows = $3, failed_rows = $4,
       duplicate_rows = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [taskId, stats.total, stats.success, stats.failed, stats.duplicate]
    );
  }

  private async refreshProfiles(reportDate: string) {
    await this.db.query(
      `INSERT INTO keyword_profile (keyword, first_seen_date, last_seen_date, best_rank, worst_rank)
       SELECT keyword, MIN(report_date), MAX(report_date), MIN(rank_num), MAX(rank_num)
       FROM aba_keyword_daily
       GROUP BY keyword
       ON CONFLICT (keyword) DO UPDATE SET
         first_seen_date = EXCLUDED.first_seen_date,
         last_seen_date = EXCLUDED.last_seen_date,
         best_rank = EXCLUDED.best_rank,
         worst_rank = EXCLUDED.worst_rank,
         updated_at = CURRENT_TIMESTAMP`
    );
    await this.db.query("UPDATE keyword_profile SET last_seen_date = $1 WHERE last_seen_date = $1", [reportDate]);
  }
}

function normalizeNullableString(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  return value ? value : null;
}

function normalizeNullableNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function normalizeNullableInt(raw: unknown): number | null {
  const value = normalizeNullableNumber(raw);
  return value !== null && Number.isInteger(value) ? value : null;
}

function matchJsonString(source: string, key: string) {
  const match = source.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`));
  return match?.[1] ?? null;
}

function matchMarketplaceId(source: string) {
  const match = source.match(/"marketplaceIds"\s*:\s*\[\s*"([^"]+)"/);
  return match?.[1] ?? null;
}
