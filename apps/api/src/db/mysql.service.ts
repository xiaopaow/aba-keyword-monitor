import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import mysql, { type Pool, type PoolConnection, type RowDataPacket } from "mysql2/promise";

@Injectable()
export class MysqlService implements OnModuleDestroy {
  private readonly logger = new Logger(MysqlService.name);
  private readonly pool: Pool;

  constructor() {
    this.pool = mysql.createPool({
      host: process.env.MYSQL_HOST ?? "127.0.0.1",
      port: Number(process.env.MYSQL_PORT ?? 3306),
      user: process.env.MYSQL_USER ?? "root",
      password: process.env.MYSQL_PASSWORD ?? "root",
      database: process.env.MYSQL_DATABASE ?? "lingxing",
      charset: "utf8mb4",
      waitForConnections: true,
      connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT ?? 10),
      namedPlaceholders: false
    });
  }

  async onModuleDestroy() {
    await this.pool.end().catch((error) => this.logger.warn(`MySQL pool close failed: ${error.message}`));
  }

  async query<T extends RowDataPacket = RowDataPacket>(sql: string, params: unknown[] = []) {
    const [rows] = await this.pool.query<T[]>(sql, params);
    return rows;
  }

  async connection<T>(callback: (connection: PoolConnection) => Promise<T>) {
    const connection = await this.pool.getConnection();
    try {
      return await callback(connection);
    } finally {
      connection.release();
    }
  }
}
