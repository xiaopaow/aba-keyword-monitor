"use client";

import type { AbaSearchTermsResponse, AbaWeek, MemberUser } from "@aba/shared";
import { getDeviceFingerprint } from "./device";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "";

export interface ApiResult<T> {
  data: T | null;
  error: string;
  status: number;
}

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

async function postJsonResult<T>(path: string, body: unknown): Promise<ApiResult<T>> {
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
    const text = await response.text();
    const payload = parsePayload(text);
    if (!response.ok) {
      return { data: null, error: readApiError(payload, `HTTP ${response.status}`), status: response.status };
    }
    return { data: (payload as T) ?? null, error: "", status: response.status };
  } catch (error) {
    console.error(`API request failed: ${path}`, error);
    return { data: null, error: "Network request failed.", status: 0 };
  }
}

async function parseJson<T>(response: Response, fallback: T): Promise<T> {
  const text = await response.text();
  if (!text.trim()) return fallback;
  return JSON.parse(text) as T;
}

function parsePayload(text: string) {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function readApiError(payload: unknown, fallback: string) {
  if (!payload) return fallback;
  if (typeof payload === "string") return payload;
  if (typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const message = record.message;
    if (Array.isArray(message)) return message.join(" ");
    if (typeof message === "string") return message;
    if (typeof record.error === "string") return record.error;
  }
  return fallback;
}

export async function fetchCurrentMember() {
  return getJson<MemberUser | null>("/api/auth/me", null);
}

export async function loginMember(email: string, password: string) {
  return postJsonResult<MemberUser>(
    "/api/auth/login",
    { email, password, deviceFingerprint: await getDeviceFingerprint() }
  );
}

export async function registerMember(email: string, password: string) {
  return postJsonResult<MemberUser>(
    "/api/auth/register",
    { email, password, deviceFingerprint: await getDeviceFingerprint() }
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
