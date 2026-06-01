import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? "postgres://aba:aba_password@localhost:5432/aba_keywords"
  });

  async onModuleInit() {
    try {
      const schema = await readFile(join(process.cwd(), "src/db/schema.sql"), "utf8").catch(() =>
        readFile(join(process.cwd(), "dist/db/schema.sql"), "utf8")
      );
      await this.pool.query(schema);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`PostgreSQL unavailable; legacy dashboard/import APIs may not work. ${message}`);
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }

  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
