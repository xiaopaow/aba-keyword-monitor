#!/usr/bin/env node

/**
 * Create or update Pro members in the local MySQL database.
 *
 * Single account:
 *   node scripts/create-pro-member.mjs --email user@example.com --password abc123456 --days 365 --reset-device
 *
 * Seed local testers:
 *   node scripts/create-pro-member.mjs --seed-testers
 *
 * MySQL defaults match the local app:
 *   127.0.0.1:3306 / root / root / lingxing
 */

import { pbkdf2Sync, randomBytes } from "node:crypto";
import mysql from "mysql2/promise";

const TESTERS = [
  "tester1@deepwhale.local",
  "tester2@deepwhale.local",
  "tester3@deepwhale.local",
  "tester4@deepwhale.local",
  "tester5@deepwhale.local"
];

const args = parseArgs(process.argv.slice(2));
const days = Number(args.days ?? 365);
const resetDevice = Boolean(args.resetDevice || args.seedTesters);

if (!Number.isFinite(days) || days < 1) {
  fail("--days must be a positive number.");
}

const targets = args.seedTesters
  ? TESTERS.map((email) => ({ email, password: "test123456" }))
  : [{ email: String(args.email ?? "").trim().toLowerCase(), password: String(args.password ?? "") }];

if (!args.seedTesters) {
  if (!targets[0].email.includes("@")) fail("--email is required.");
  if (targets[0].password.length < 6) fail("--password must be at least 6 characters.");
}

const connection = await mysql.createConnection({
  host: process.env.MYSQL_HOST ?? "127.0.0.1",
  port: Number(process.env.MYSQL_PORT ?? 3306),
  user: process.env.MYSQL_USER ?? "root",
  password: process.env.MYSQL_PASSWORD ?? "root",
  database: process.env.MYSQL_DATABASE ?? "lingxing",
  charset: "utf8mb4"
});

try {
  for (const target of targets) {
    await upsertProMember(connection, target.email, target.password, days, resetDevice);
    console.log(`OK ${target.email} / ${target.password} / pro / ${days} days${resetDevice ? " / device reset" : ""}`);
  }
} finally {
  await connection.end();
}

async function upsertProMember(connection, email, password, days, resetDevice) {
  await connection.execute(
    `INSERT INTO aba_members (email, password_hash, plan, status, expires_at, device_fingerprint, device_bound_at)
     VALUES (?, ?, 'pro', 'active', DATE_ADD(NOW(), INTERVAL ? DAY), NULL, NULL)
     ON DUPLICATE KEY UPDATE
       password_hash = VALUES(password_hash),
       plan = 'pro',
       status = 'active',
       expires_at = VALUES(expires_at),
       device_fingerprint = IF(? = 1, NULL, device_fingerprint),
       device_bound_at = IF(? = 1, NULL, device_bound_at)`,
    [email, hashPassword(password), days, resetDevice ? 1 : 0, resetDevice ? 1 : 0]
  );
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 100000, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$100000$${salt}$${hash}`;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = toCamel(token.slice(2));
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
