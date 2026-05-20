"use client";

import {
  mockAlerts,
  mockCurrentRows,
  mockDashboard,
  mockImportTask,
  mockKeywordRows,
  mockOpportunities,
  mockTrend
} from "@aba/shared";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:4000";

async function getJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

export async function fetchDashboard(date = "2026-05-20", compareDate = "2026-05-19") {
  return getJson(`/api/dashboard?date=${date}&compareDate=${compareDate}`, {
    date,
    compareDate,
    summary: mockDashboard,
    distribution: mockDashboard.distribution,
    trend: mockTrend,
    topUp: mockKeywordRows.filter((row) => (row.changeValue ?? 0) > 0).slice(0, 10),
    topDown: mockKeywordRows.filter((row) => (row.changeValue ?? 0) < 0).slice(0, 10)
  });
}

export async function fetchKeywords() {
  return getJson("/api/keywords?date=2026-05-20&compareDate=2026-05-19&pageSize=100", {
    rows: mockKeywordRows,
    page: 1,
    pageSize: 100,
    total: mockKeywordRows.length
  });
}

export async function fetchKeyword(keyword: string) {
  const row = mockKeywordRows.find((item) => item.keyword === keyword) ?? mockKeywordRows[0];
  return getJson(`/api/keywords/${encodeURIComponent(keyword)}?date=2026-05-20`, {
    ...row,
    currentRank: row.currentRank,
    yesterdayRank: row.compareRank,
    sevenDayChange: 5400,
    thirtyDayChange: 12000,
    trend: mockTrend.slice(-14).map((point, index) => ({ date: point.date, rank: Math.max(1, (row.currentRank ?? 1000) + (14 - index) * 180) }))
  });
}

export async function fetchOpportunities() {
  return getJson("/api/opportunities?date=2026-05-20", { date: "2026-05-20", rows: mockOpportunities });
}

export async function fetchAlerts() {
  return getJson("/api/alerts?date=2026-05-20", { date: "2026-05-20", rows: mockAlerts });
}

export async function fetchImportTask() {
  return getJson("/api/import/tasks/1", mockImportTask);
}

export async function uploadImport(file: File, reportDate: string) {
  const form = new FormData();
  form.append("file", file);
  form.append("reportDate", reportDate);
  const response = await fetch(`${API_BASE}/api/import/upload`, { method: "POST", body: form });
  if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
  return response.json();
}

export { mockCurrentRows };
