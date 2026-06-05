import { ForbiddenException, Injectable, Logger, OnModuleInit, UnauthorizedException } from "@nestjs/common";
import type { Request, Response } from "express";
import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { MysqlService } from "../db/mysql.service.js";

type MembershipPlan = "trial" | "basic" | "pro";
type AccessAction = "query" | "export" | "copy";

interface UserRow extends RowDataPacket {
  id: number;
  email: string;
  password_hash: string;
  plan: MembershipPlan;
  status: "active" | "blocked" | "expired";
  expires_at: Date | string | null;
  device_fingerprint: string | null;
}

interface UsageRow extends RowDataPacket {
  query_count: number;
  export_count: number;
  copy_count: number;
}

export interface AuthenticatedUser {
  id: number;
  email: string;
  plan: MembershipPlan;
  status: string;
  expiresAt: string | null;
  deviceBound: boolean;
}

const SESSION_COOKIE = "aba_session";
const SESSION_DAYS = 7;

const PLAN_LIMITS: Record<
  MembershipPlan,
  { queryPerDay: number; exportPerDay: number; copyPerDay: number; dataDepth: number; exportLimit: number }
> = {
  trial: { queryPerDay: 100, exportPerDay: 0, copyPerDay: 20, dataDepth: 1000, exportLimit: 0 },
  basic: { queryPerDay: 1000, exportPerDay: 3, copyPerDay: 200, dataDepth: 50000, exportLimit: 10000 },
  pro: { queryPerDay: 5000, exportPerDay: 20, copyPerDay: 1000, dataDepth: 500000, exportLimit: 10000 }
};

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly mysql: MysqlService) {}

  async onModuleInit() {
    await this.ensureSchema();
    await this.seedDefaultUser();
    await this.seedDemoProUser();
  }

  async login(email: string, password: string, deviceFingerprint: string, req: Request, res: Response) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.findUserByEmail(normalizedEmail);
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw new UnauthorizedException("Invalid email or password.");
    }

    this.assertMemberCanAccess(user);
    await this.assertOrBindDevice(user, deviceFingerprint, req);

    const plainToken = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(plainToken);
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await this.mysql.connection(async (connection) => {
      await connection.execute(
        `INSERT INTO aba_member_sessions
          (user_id, token_hash, device_fingerprint, ip_address, user_agent, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [user.id, tokenHash, deviceFingerprint, getIp(req), req.headers["user-agent"] ?? "", expiresAt]
      );
    });

    res.cookie(SESSION_COOKIE, plainToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
      path: "/"
    });

    await this.logAccess(user.id, "login", req, { deviceFingerprint });
    return this.publicUser({ ...user, device_fingerprint: deviceFingerprint });
  }

  async register(email: string, password: string, deviceFingerprint: string, req: Request, res: Response) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.includes("@")) throw new ForbiddenException("Valid email required.");
    if (!password || password.length < 8) throw new ForbiddenException("Password must be at least 8 characters.");

    const existing = await this.findUserByEmail(normalizedEmail);
    if (existing) throw new ForbiddenException("Email already registered.");

    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    await this.mysql.connection(async (connection) => {
      await connection.execute(
        `INSERT INTO aba_members (email, password_hash, plan, status, expires_at)
         VALUES (?, ?, 'trial', 'active', ?)`,
        [normalizedEmail, hashPassword(password), expiresAt]
      );
    });

    await this.logAccess(null, "register", req, { email: normalizedEmail });
    return this.login(normalizedEmail, password, deviceFingerprint, req, res);
  }

  async logout(req: Request, res: Response) {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) {
      await this.mysql.connection(async (connection) => {
        await connection.execute("UPDATE aba_member_sessions SET revoked_at = NOW() WHERE token_hash = ?", [hashToken(token)]);
      });
    }
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  }

  async currentUser(req: Request) {
    const user = await this.validateRequest(req, false);
    return user ? this.publicUser(user) : null;
  }

  async validateRequest(req: Request, required = true): Promise<UserRow | null> {
    const token = readCookie(req, SESSION_COOKIE);
    const deviceFingerprint = getDeviceFingerprint(req);
    if (!token) {
      if (required) throw new UnauthorizedException("Login required.");
      return null;
    }

    const rows = await this.mysql.query<UserRow>(
      `SELECT s.id AS session_id, s.user_id, s.expires_at AS session_expires_at, s.revoked_at,
              u.id, u.email, u.password_hash, u.plan, u.status, u.expires_at, u.device_fingerprint
       FROM aba_member_sessions s
       JOIN aba_members u ON u.id = s.user_id
       WHERE s.token_hash = ?
       LIMIT 1`,
      [hashToken(token)]
    );
    const row = rows[0] as any;
    if (!row || row.revoked_at || new Date(row.session_expires_at).getTime() < Date.now()) {
      if (required) throw new UnauthorizedException("Session expired.");
      return null;
    }

    this.assertMemberCanAccess(row);
    await this.assertOrBindDevice(row, deviceFingerprint, req);
    return row;
  }

  async consumeQuota(user: AuthenticatedUser | UserRow, action: AccessAction, req: Request, query: Record<string, unknown> = {}) {
    const plan = (user.plan ?? "trial") as MembershipPlan;
    const limits = PLAN_LIMITS[plan];
    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.max(Number(query.pageSize ?? 50), 1);
    const requestedDepth = page * pageSize;

    if (action === "query" && requestedDepth > limits.dataDepth) {
      await this.logAccess(user.id, action, req, query, "blocked", "data_depth_limit");
      throw new ForbiddenException(`Your plan can view up to ${limits.dataDepth.toLocaleString("en-US")} rows.`);
    }
    if (action === "export" && limits.exportLimit <= 0) {
      await this.logAccess(user.id, action, req, query, "blocked", "export_disabled");
      throw new ForbiddenException("Export is not enabled for your plan.");
    }

    const today = todayKey();
    const usage = await this.mysql.query<UsageRow>(
      "SELECT query_count, export_count, copy_count FROM aba_member_usage_daily WHERE user_id = ? AND usage_date = ? LIMIT 1",
      [user.id, today]
    );
    const current = usage[0] ?? { query_count: 0, export_count: 0, copy_count: 0 };
    const nextQuery = Number(current.query_count ?? 0) + (action === "query" ? 1 : 0);
    const nextExport = Number(current.export_count ?? 0) + (action === "export" ? 1 : 0);
    const nextCopy = Number(current.copy_count ?? 0) + (action === "copy" ? 1 : 0);

    if (nextQuery > limits.queryPerDay) throw new ForbiddenException("Daily query quota exceeded.");
    if (nextExport > limits.exportPerDay) throw new ForbiddenException("Daily export quota exceeded.");
    if (nextCopy > limits.copyPerDay) throw new ForbiddenException("Daily copy quota exceeded.");

    await this.mysql.connection(async (connection) => {
      await connection.execute(
        `INSERT INTO aba_member_usage_daily (user_id, usage_date, query_count, export_count, copy_count)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           query_count = VALUES(query_count),
           export_count = VALUES(export_count),
           copy_count = VALUES(copy_count)`,
        [user.id, today, nextQuery, nextExport, nextCopy]
      );
    });

    await this.logAccess(user.id, action, req, query);
  }

  async logExport(user: AuthenticatedUser | UserRow, req: Request, rowCount: number, query: Record<string, unknown>) {
    const exportId = `EXP-${Date.now()}-${randomBytes(4).toString("hex")}`;
    await this.mysql.connection(async (connection) => {
      await connection.execute(
        `INSERT INTO aba_export_logs (export_id, user_id, row_count, query_json, ip_address, user_agent, device_fingerprint)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [exportId, user.id, rowCount, JSON.stringify(query), getIp(req), req.headers["user-agent"] ?? "", getDeviceFingerprint(req)]
      );
    });
    return exportId;
  }

  async createOrder(user: AuthenticatedUser | UserRow, plan: "basic" | "pro", req: Request) {
    if (plan !== "basic" && plan !== "pro") throw new ForbiddenException("Invalid plan.");
    const orderNo = `DW-${Date.now()}-${randomBytes(3).toString("hex").toUpperCase()}`;
    await this.mysql.connection(async (connection) => {
      await connection.execute(
        `INSERT INTO aba_member_orders (order_no, user_id, plan, status)
         VALUES (?, ?, ?, 'pending')`,
        [orderNo, user.id, plan]
      );
    });
    await this.logAccess(user.id, "create_order", req, { orderNo, plan });
    return { ok: true, orderNo, status: "pending" };
  }

  publicUser(user: UserRow): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      plan: user.plan,
      status: user.status,
      expiresAt: user.expires_at ? new Date(user.expires_at).toISOString() : null,
      deviceBound: Boolean(user.device_fingerprint)
    };
  }

  private async ensureSchema() {
    await this.mysql.connection(async (connection) => {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS aba_members (
          id BIGINT PRIMARY KEY AUTO_INCREMENT,
          email VARCHAR(255) NOT NULL UNIQUE,
          password_hash VARCHAR(255) NOT NULL,
          plan ENUM('trial','basic','pro') NOT NULL DEFAULT 'trial',
          status ENUM('active','blocked','expired') NOT NULL DEFAULT 'active',
          expires_at DATETIME NULL,
          device_fingerprint VARCHAR(255) NULL,
          device_bound_at DATETIME NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_status_plan (status, plan)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS aba_member_sessions (
          id BIGINT PRIMARY KEY AUTO_INCREMENT,
          user_id BIGINT NOT NULL,
          token_hash CHAR(64) NOT NULL UNIQUE,
          device_fingerprint VARCHAR(255) NOT NULL,
          ip_address VARCHAR(64),
          user_agent TEXT,
          expires_at DATETIME NOT NULL,
          revoked_at DATETIME NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_user_expires (user_id, expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS aba_member_usage_daily (
          user_id BIGINT NOT NULL,
          usage_date DATE NOT NULL,
          query_count INT NOT NULL DEFAULT 0,
          export_count INT NOT NULL DEFAULT 0,
          copy_count INT NOT NULL DEFAULT 0,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, usage_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS aba_access_logs (
          id BIGINT PRIMARY KEY AUTO_INCREMENT,
          user_id BIGINT NULL,
          action VARCHAR(30) NOT NULL,
          status VARCHAR(30) NOT NULL DEFAULT 'ok',
          reason VARCHAR(100) NULL,
          ip_address VARCHAR(64),
          user_agent TEXT,
          device_fingerprint VARCHAR(255),
          query_json JSON NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_user_time (user_id, created_at),
          INDEX idx_action_time (action, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS aba_export_logs (
          id BIGINT PRIMARY KEY AUTO_INCREMENT,
          export_id VARCHAR(64) NOT NULL UNIQUE,
          user_id BIGINT NOT NULL,
          row_count INT NOT NULL,
          query_json JSON NULL,
          ip_address VARCHAR(64),
          user_agent TEXT,
          device_fingerprint VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_user_time (user_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS aba_member_orders (
          id BIGINT PRIMARY KEY AUTO_INCREMENT,
          order_no VARCHAR(64) NOT NULL UNIQUE,
          user_id BIGINT NOT NULL,
          plan ENUM('basic','pro') NOT NULL,
          status ENUM('pending','approved','cancelled') NOT NULL DEFAULT 'pending',
          note VARCHAR(255) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_user_status (user_id, status),
          INDEX idx_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    });
  }

  private async seedDefaultUser() {
    const email = (process.env.DEFAULT_ADMIN_EMAIL ?? "admin@aba.local").trim().toLowerCase();
    const password = process.env.DEFAULT_ADMIN_PASSWORD ?? "admin123456";
    const plan = (process.env.DEFAULT_ADMIN_PLAN ?? "pro") as MembershipPlan;
    const existing = await this.findUserByEmail(email);
    if (existing) return;

    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    await this.mysql.connection(async (connection) => {
      await connection.execute(
        `INSERT INTO aba_members (email, password_hash, plan, status, expires_at)
         VALUES (?, ?, ?, 'active', ?)`,
        [email, hashPassword(password), plan, expiresAt]
      );
    });
    this.logger.log(`Seeded local member ${email}; change DEFAULT_ADMIN_PASSWORD before production.`);
  }

  private async seedDemoProUser() {
    const email = "demo@deepwhale.local";
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    await this.mysql.connection(async (connection) => {
      await connection.execute(
        `INSERT INTO aba_members (email, password_hash, plan, status, expires_at, device_fingerprint, device_bound_at)
         VALUES (?, ?, 'pro', 'active', ?, NULL, NULL)
         ON DUPLICATE KEY UPDATE
           password_hash = VALUES(password_hash),
           plan = 'pro',
           status = 'active',
           expires_at = VALUES(expires_at),
           device_fingerprint = NULL,
           device_bound_at = NULL`,
        [email, hashPassword("demo123456"), expiresAt]
      );
    });
    this.logger.log(`Seeded or refreshed local Pro member ${email}.`);
  }

  private async findUserByEmail(email: string) {
    const rows = await this.mysql.query<UserRow>("SELECT * FROM aba_members WHERE email = ? LIMIT 1", [email]);
    return rows[0] ?? null;
  }

  private assertMemberCanAccess(user: UserRow) {
    if (user.status !== "active") throw new ForbiddenException("Member account is not active.");
    if (user.expires_at && new Date(user.expires_at).getTime() < Date.now()) {
      throw new ForbiddenException("Membership expired.");
    }
  }

  private async assertOrBindDevice(user: UserRow, deviceFingerprint: string, req: Request) {
    if (!deviceFingerprint || deviceFingerprint.length < 16) {
      throw new ForbiddenException("Valid device fingerprint required.");
    }
    if (!user.device_fingerprint) {
      await this.mysql.connection(async (connection) => {
        await connection.execute(
          "UPDATE aba_members SET device_fingerprint = ?, device_bound_at = NOW() WHERE id = ? AND device_fingerprint IS NULL",
          [deviceFingerprint, user.id]
        );
      });
      await this.logAccess(user.id, "bind_device", req, { deviceFingerprint });
      return;
    }
    if (user.device_fingerprint !== deviceFingerprint) {
      await this.logAccess(user.id, "device_mismatch", req, { deviceFingerprint }, "blocked", "device_mismatch");
      throw new ForbiddenException("This account is bound to another device.");
    }
  }

  private async logAccess(userId: number | null, action: string, req: Request, query: unknown = {}, status = "ok", reason: string | null = null) {
    await this.mysql.connection(async (connection) => {
      await connection.execute(
        `INSERT INTO aba_access_logs (user_id, action, status, reason, ip_address, user_agent, device_fingerprint, query_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, action, status, reason, getIp(req), req.headers["user-agent"] ?? "", getDeviceFingerprint(req), JSON.stringify(query ?? {})]
      );
    });
  }
}

export function getAuthenticatedUser(req: Request): AuthenticatedUser {
  return (req as any).abaUser as AuthenticatedUser;
}

export function getDeviceFingerprint(req: Request) {
  return String(req.headers["x-device-fingerprint"] ?? "").slice(0, 255);
}

function readCookie(req: Request, name: string) {
  const cookies = String(req.headers.cookie ?? "");
  for (const part of cookies.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return "";
}

function getIp(req: Request) {
  const forwarded = String(req.headers["x-forwarded-for"] ?? "").split(",")[0]?.trim();
  return forwarded || req.socket.remoteAddress || "";
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 100000, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$100000$${salt}$${hash}`;
}

function verifyPassword(password: string, stored: string) {
  const [algo, iterations, salt, expected] = stored.split("$");
  if (algo !== "pbkdf2_sha256" || !iterations || !salt || !expected) return false;
  const actual = pbkdf2Sync(password, salt, Number(iterations), 32, "sha256");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}
