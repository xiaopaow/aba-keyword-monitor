"use client";

import type { AbaSearchTermsResponse, AbaWeek, MemberUser } from "@aba/shared";
import { getDeviceFingerprint } from "./device";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "";

async function getJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      cache: "no-store",
      credentials: "include",
      headers: {
        "x-device-fingerprint": await getDeviceFingerprint()
      }
    });
    if (response.status === 401 || response.status === 403 || response.status === 204) return fallback;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return parseJson(response, fallback);
  } catch (error) {
    console.error(`API request failed: ${path}`, error);
    return fallback;
  }
}

async function postJson<T>(path: string, body: unknown, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      cache: "no-store",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-device-fingerprint": await getDeviceFingerprint()
      },
      body: JSON.stringify(body ?? {})
    });
    if (response.status === 401 || response.status === 403 || response.status === 204) return fallback;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return parseJson(response, fallback);
  } catch (error) {
    console.error(`API request failed: ${path}`, error);
    return fallback;
  }
}

async function parseJson<T>(response: Response, fallback: T): Promise<T> {
  const text = await response.text();
  if (!text.trim()) return fallback;
  return JSON.parse(text) as T;
}

export async function fetchCurrentMember() {
  return getJson<MemberUser | null>("/api/auth/me", null);
}

export async function loginMember(email: string, password: string) {
  return postJson<MemberUser | null>(
    "/api/auth/login",
    { email, password, deviceFingerprint: await getDeviceFingerprint() },
    null
  );
}

export async function registerMember(email: string, password: string) {
  return postJson<MemberUser | null>(
    "/api/auth/register",
    { email, password, deviceFingerprint: await getDeviceFingerprint() },
    null
  );
}

export async function logoutMember() {
  return postJson("/api/auth/logout", {}, { ok: false });
}

export async function createMemberOrder(plan: "basic" | "pro") {
  return postJson<{ ok: boolean; orderNo?: string; status?: string } | null>("/api/auth/orders", { plan }, null);
}

export async function logKeywordCopy(payload: Record<string, unknown>) {
  return postJson("/api/auth/copy-log", payload, { ok: false });
}

export async function fetchAbaWeeks() {
  return getJson<AbaWeek[]>("/api/aba/weeks", []);
}

export async function fetchAbaSearchTerms(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return getJson<AbaSearchTermsResponse>(`/api/aba/search-terms?${query.toString()}`, {
    rows: [],
    page: Number(params.page ?? 1),
    pageSize: Number(params.pageSize ?? 50),
    total: 0,
    weekStart: null,
    weekEnd: null,
    compareWeekStart: null
  });
}

export async function fetchAbaSearchTermsExport(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return getJson<AbaSearchTermsResponse>(`/api/aba/search-terms/export?${query.toString()}`, {
    rows: [],
    page: 1,
    pageSize: Number(params.pageSize ?? 10000),
    total: 0,
    weekStart: null,
    weekEnd: null,
    compareWeekStart: null
  });
}
