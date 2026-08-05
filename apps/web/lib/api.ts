"use client";

import type { AbaSearchTermsResponse, AbaWeek, MemberUser } from "@aba/shared";

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
      credentials: "include"
    });
    if (!response.ok || response.status === 204) return fallback;
    return parseJson(response, fallback);
  } catch {
    return fallback;
  }
}

async function getJsonResult<T>(path: string): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      cache: "no-store",
      credentials: "include"
    });
    const text = await response.text();
    const payload = parsePayload(text);
    if (!response.ok) {
      if (response.status >= 500) {
        return { data: null, error: "查询失败，请缩小筛选条件或稍后重试。", status: response.status };
      }
      return { data: null, error: readApiError(payload, `HTTP ${response.status}`), status: response.status };
    }
    return { data: (payload as T) ?? null, error: "", status: response.status };
  } catch {
    return { data: null, error: "无法连接后端服务，请确认 API 已启动。", status: 0 };
  }
}

async function postJson<T>(path: string, body: unknown, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      cache: "no-store",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body ?? {})
    });
    if (!response.ok || response.status === 204) return fallback;
    return parseJson(response, fallback);
  } catch {
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
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body ?? {})
    });
    const text = await response.text();
    const payload = parsePayload(text);
    if (!response.ok) {
      return { data: null, error: readApiError(payload, `HTTP ${response.status}`), status: response.status };
    }
    return { data: (payload as T) ?? null, error: "", status: response.status };
  } catch {
    return { data: null, error: "无法连接后端服务，请稍后重试。", status: 0 };
  }
}

async function patchJsonResult<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "PATCH",
      cache: "no-store",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body ?? {})
    });
    const text = await response.text();
    const payload = parsePayload(text);
    if (!response.ok) {
      return { data: null, error: readApiError(payload, `HTTP ${response.status}`), status: response.status };
    }
    return { data: (payload as T) ?? null, error: "", status: response.status };
  } catch {
    return { data: null, error: "无法连接后端服务，请稍后重试。", status: 0 };
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

export interface AdminMember {
  id: number;
  email: string;
  plan: "trial" | "basic" | "pro";
  role: "member" | "admin";
  status: "active" | "blocked" | "expired";
  expiresAt: string | null;
  deviceBound: boolean;
  activeSessions: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminMemberList {
  rows: AdminMember[];
  total: number;
  page: number;
  pageSize: number;
  summary: {
    total: number;
    admins: number;
    active: number;
    trial: number;
    basic: number;
    pro: number;
  };
}

export async function fetchAdminMembers(params: {
  query?: string;
  plan?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return getJsonResult<AdminMemberList>(`/api/admin/members?${query.toString()}`);
}

export async function updateAdminMember(
  id: number,
  body: { plan?: AdminMember["plan"]; status?: AdminMember["status"]; expiresAt?: string | null; extendDays?: number }
) {
  return patchJsonResult<AdminMember>(`/api/admin/members/${id}`, body);
}

export async function revokeAdminMemberSessions(id: number) {
  return postJsonResult<{ ok: boolean; affectedRows: number }>(`/api/admin/members/${id}/revoke-sessions`, {});
}

export async function loginMember(email: string, password: string) {
  return postJsonResult<MemberUser>("/api/auth/login", { email, password });
}

export async function registerMember(email: string, password: string) {
  return postJsonResult<MemberUser>("/api/auth/register", { email, password });
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

export async function fetchAbaSearchTermsResult(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return getJsonResult<AbaSearchTermsResponse>(`/api/aba/search-terms?${query.toString()}`);
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
