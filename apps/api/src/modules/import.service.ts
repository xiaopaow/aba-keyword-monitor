import { Injectable } from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import csv from "csv-parser";
import { Redis } from "ioredis";
import { createReadStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { extname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { parser } from "stream-json";
import { streamArray } from "stream-json/streamers/StreamArray.js";
import XLSX from "xlsx";
import { normalizeKeyword, normalizeRank } from "@aba/shared";
import { DatabaseService } from "../db/database.service.js";

interface ImportJob {
  taskId: number;
  filePath: string;
  reportDate: string;
}

@Injectable()
export class ImportService {
  private readonly uploadDir = process.env.UPLOAD_DIR ?? "uploads";
  private readonly connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
  private readonly queue = new Queue<ImportJob>("aba-import", { connection: this.connection });
  private readonly worker = new Worker<ImportJob>("aba-import", (job) => this.process(job.data), { connection: this.connection });

  constructor(private readonly db: DatabaseService) {}

  async createTask(fileName: string, reportDate: string) {
    const result = await this.db.query<{ id: string; status: string }>(
      "INSERT INTO import_task (file_name, report_date, status) VALUES ($1, $2, 'pending') RETURNING id, status",
      [fileName, reportDate]
    );
    return { taskId: Number(result.rows[0].id), status: result.rows[0].status };
  }

  async upload(file: Express.Multer.File, reportDate: string) {
    const task = await this.createTask(file.originalname, reportDate);
    await this.queue.add("process", { taskId: task.taskId, filePath: file.path, reportDate });
    await this.db.query("UPDATE import_task SET status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [task.taskId]);
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
