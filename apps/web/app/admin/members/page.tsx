"use client";

import type { MemberUser } from "@aba/shared";
import clsx from "clsx";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Loader2,
  LogOut,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users
} from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type AdminMember,
  type AdminMemberList,
  fetchAdminMembers,
  fetchCurrentMember,
  revokeAdminMemberSessions,
  updateAdminMember
} from "../../../lib/api";

const AUTH_CHANGED_EVENT = "deepwhale:auth-changed";
const OPEN_AUTH_EVENT = "deepwhale:open-auth";

type MemberDraft = {
  plan: AdminMember["plan"];
  status: AdminMember["status"];
  expiresAt: string;
};

const emptyList: AdminMemberList = {
  rows: [],
  total: 0,
  page: 1,
  pageSize: 20,
  summary: { total: 0, admins: 0, active: 0, trial: 0, basic: 0, pro: 0 }
};

export default function AdminMembersPage() {
  const [member, setMember] = useState<MemberUser | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [data, setData] = useState<AdminMemberList>(emptyList);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [plan, setPlan] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [drafts, setDrafts] = useState<Record<number, MemberDraft>>({});
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const resolveMember = useCallback(async () => {
    const nextMember = await fetchCurrentMember();
    setMember(nextMember);
    setAuthResolved(true);
  }, []);

  useEffect(() => {
    void resolveMember();
    window.addEventListener(AUTH_CHANGED_EVENT, resolveMember);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, resolveMember);
  }, [resolveMember]);

  const loadMembers = useCallback(async () => {
    if (member?.role !== "admin") return;
    setLoading(true);
    setError("");
    const result = await fetchAdminMembers({ query, plan, status, page, pageSize: 20 });
    if (!result.data) {
      setError(result.status === 403 ? "当前账号没有管理员权限。" : result.error || "账号列表加载失败。");
      setLoading(false);
      return;
    }

    setData(result.data);
    setDrafts(
      Object.fromEntries(
        result.data.rows.map((row) => [
          row.id,
          {
            plan: row.plan,
            status: row.status,
            expiresAt: row.expiresAt ? row.expiresAt.slice(0, 10) : ""
          }
        ])
      )
    );
    setLoading(false);
  }, [member?.role, page, plan, query, status]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const totalPages = Math.max(Math.ceil(data.total / data.pageSize), 1);

  const visibleRange = useMemo(() => {
    if (!data.total) return "0";
    const start = (data.page - 1) * data.pageSize + 1;
    const end = Math.min(data.page * data.pageSize, data.total);
    return `${start}-${end}`;
  }, [data.page, data.pageSize, data.total]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setQuery(queryInput.trim());
  }

  function updateDraft(id: number, patch: Partial<MemberDraft>) {
    setDrafts((current) => ({
      ...current,
      [id]: { ...current[id], ...patch }
    }));
  }

  async function saveMember(row: AdminMember) {
    const draft = drafts[row.id];
    if (!draft || busyId !== null) return;
    setBusyId(row.id);
    setMessage("");
    setError("");
    const result = await updateAdminMember(row.id, {
      plan: draft.plan,
      status: draft.status,
      expiresAt: draft.expiresAt ? `${draft.expiresAt}T23:59:59` : null
    });
    if (!result.data) {
      setError(result.error || "账号更新失败。");
    } else {
      setMessage(`已更新 ${row.email}`);
      await loadMembers();
    }
    setBusyId(null);
  }

  async function extendMember(row: AdminMember, days: number) {
    if (busyId !== null) return;
    setBusyId(row.id);
    setMessage("");
    setError("");
    const result = await updateAdminMember(row.id, { extendDays: days });
    if (!result.data) {
      setError(result.error || "延长有效期失败。");
    } else {
      setMessage(`已为 ${row.email} 延长 ${days} 天`);
      await loadMembers();
    }
    setBusyId(null);
  }

  async function revokeSessions(row: AdminMember) {
    if (busyId !== null) return;
    const confirmed = window.confirm(`确定让 ${row.email} 的所有登录会话立即失效吗？`);
    if (!confirmed) return;

    setBusyId(row.id);
    setMessage("");
    setError("");
    const result = await revokeAdminMemberSessions(row.id);
    if (!result.data) {
      setError(result.error || "会话重置失败。");
    } else {
      setMessage(`已退出 ${row.email} 的 ${result.data.affectedRows} 个会话`);
      await loadMembers();
    }
    setBusyId(null);
  }

  if (!authResolved) {
    return <PageLoading label="正在验证管理员权限..." />;
  }

  if (!member) {
    return (
      <AccessState
        icon={<ShieldAlert className="h-6 w-6" />}
        title="请先登录管理员账号"
        description="账号管理涉及会员权限与登录会话，只对管理员开放。"
        actionLabel="登录管理员账号"
        onAction={() => window.dispatchEvent(new CustomEvent(OPEN_AUTH_EVENT, { detail: { mode: "login" } }))}
      />
    );
  }

  if (member.role !== "admin") {
    return (
      <AccessState
        icon={<ShieldAlert className="h-6 w-6" />}
        title="没有管理员权限"
        description={`当前登录账号 ${member.email} 不能访问账号管理。`}
      />
    );
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-sky-700 dark:text-sky-300">
            <ShieldCheck className="h-4 w-4" />
            管理后台
          </div>
          <h1 className="mt-2 text-2xl font-black text-slate-950 dark:text-white md:text-3xl">账号管理</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            管理套餐、状态、到期时间和在线会话。管理员角色只能通过服务器配置创建。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadMembers()}
          disabled={loading}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 shadow-sm transition hover:border-sky-300 hover:text-sky-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          <RefreshCw className={clsx("h-4 w-4", loading && "animate-spin")} />
          刷新
        </button>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <SummaryMetric label="全部账号" value={data.summary.total} icon={<Users className="h-4 w-4" />} />
        <SummaryMetric label="有效账号" value={data.summary.active} icon={<UserCheck className="h-4 w-4" />} tone="green" />
        <SummaryMetric label="管理员" value={data.summary.admins} icon={<ShieldCheck className="h-4 w-4" />} tone="sky" />
        <SummaryMetric label="体验版" value={data.summary.trial} />
        <SummaryMetric label="专业版" value={data.summary.basic} />
        <SummaryMetric label="商业版" value={data.summary.pro} />
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <form
          className="grid gap-3 border-b border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60 md:grid-cols-[minmax(260px,1fr)_180px_180px_auto]"
          onSubmit={submitSearch}
        >
          <label className="relative block">
            <span className="sr-only">搜索邮箱</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              placeholder="搜索邮箱"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-sky-950"
            />
          </label>
          <select
            value={plan}
            onChange={(event) => {
              setPlan(event.target.value);
              setPage(1);
            }}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            <option value="">全部套餐</option>
            <option value="trial">体验版</option>
            <option value="basic">专业版</option>
            <option value="pro">商业版</option>
          </select>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            <option value="">全部状态</option>
            <option value="active">有效</option>
            <option value="blocked">已停用</option>
            <option value="expired">已过期</option>
          </select>
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-sky-600 px-5 text-sm font-bold text-white transition hover:bg-sky-700">
            <Search className="h-4 w-4" />
            查询
          </button>
        </form>

        {message || error ? (
          <div
            className={clsx(
              "border-b px-4 py-3 text-sm font-medium",
              error
                ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
            )}
          >
            {error || message}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1250px] text-sm">
            <thead className="bg-slate-100 text-xs font-bold text-slate-500 dark:bg-slate-950 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 text-left">账号</th>
                <th className="px-4 py-3 text-left">角色</th>
                <th className="px-4 py-3 text-left">套餐</th>
                <th className="px-4 py-3 text-left">状态</th>
                <th className="px-4 py-3 text-left">有效期至</th>
                <th className="px-4 py-3 text-left">会话</th>
                <th className="px-4 py-3 text-left">注册时间</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.rows.map((row) => {
                const draft = drafts[row.id];
                const rowBusy = busyId === row.id;
                return (
                  <tr key={row.id} className="align-middle transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-4">
                      <div className="max-w-[260px] truncate font-bold text-slate-950 dark:text-white" title={row.email}>
                        {row.email}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">ID {row.id}</div>
                    </td>
                    <td className="px-4 py-4">
                      <RoleBadge role={row.role} />
                    </td>
                    <td className="px-4 py-4">
                      <select
                        value={draft?.plan ?? row.plan}
                        onChange={(event) => updateDraft(row.id, { plan: event.target.value as AdminMember["plan"] })}
                        disabled={row.role === "admin"}
                        title={row.role === "admin" ? "管理员固定使用商业版套餐" : "修改会员套餐"}
                        className="h-9 w-28 rounded-md border border-slate-200 bg-white px-2 text-sm outline-none focus:border-sky-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-800"
                      >
                        <option value="trial">体验版</option>
                        <option value="basic">专业版</option>
                        <option value="pro">商业版</option>
                      </select>
                    </td>
                    <td className="px-4 py-4">
                      <select
                        value={draft?.status ?? row.status}
                        onChange={(event) => updateDraft(row.id, { status: event.target.value as AdminMember["status"] })}
                        disabled={row.role === "admin"}
                        title={row.role === "admin" ? "管理员账号必须保持有效" : "修改账号状态"}
                        className="h-9 w-28 rounded-md border border-slate-200 bg-white px-2 text-sm outline-none focus:border-sky-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-800"
                      >
                        <option value="active">有效</option>
                        <option value="blocked">已停用</option>
                        <option value="expired">已过期</option>
                      </select>
                    </td>
                    <td className="px-4 py-4">
                      <input
                        type="date"
                        value={draft?.expiresAt ?? ""}
                        onChange={(event) => updateDraft(row.id, { expiresAt: event.target.value })}
                        className="h-9 w-36 rounded-md border border-slate-200 bg-white px-2 text-sm outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-semibold text-slate-700 dark:text-slate-200">{row.activeSessions} 个在线</div>
                      <div className="mt-1 text-xs text-slate-400">{row.deviceBound ? "有设备记录" : "无设备记录"}</div>
                    </td>
                    <td className="px-4 py-4 text-slate-600 dark:text-slate-300">
                      {new Date(row.createdAt).toLocaleDateString("zh-CN")}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => void extendMember(row, 30)}
                          disabled={busyId !== null}
                          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-xs font-bold text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
                          title="在当前有效期基础上延长 30 天"
                        >
                          <CalendarPlus className="h-3.5 w-3.5" />
                          +30天
                        </button>
                        <button
                          type="button"
                          onClick={() => void extendMember(row, 365)}
                          disabled={busyId !== null}
                          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-xs font-bold text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
                          title="在当前有效期基础上延长 365 天"
                        >
                          <CalendarPlus className="h-3.5 w-3.5" />
                          +1年
                        </button>
                        <button
                          type="button"
                          onClick={() => void revokeSessions(row)}
                          disabled={busyId !== null || row.activeSessions === 0}
                          className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 text-slate-500 transition hover:border-orange-300 hover:text-orange-600 disabled:opacity-30 dark:border-slate-700 dark:text-slate-300"
                          title="强制退出该账号的全部在线会话"
                          aria-label="强制退出全部会话"
                        >
                          <LogOut className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveMember(row)}
                          disabled={busyId !== null}
                          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-sky-600 px-3 text-xs font-bold text-white transition hover:bg-sky-700 disabled:opacity-50"
                        >
                          {rowBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                          保存
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!loading && data.rows.length === 0 ? (
          <div className="px-6 py-20 text-center text-sm text-slate-500 dark:text-slate-400">没有找到符合条件的账号。</div>
        ) : null}
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-6 py-14 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在加载账号...
          </div>
        ) : null}

        <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-sm dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-slate-500 dark:text-slate-400">
            显示 {visibleRange}，共 <span className="font-bold text-slate-800 dark:text-slate-200">{data.total}</span> 个账号
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => Math.max(current - 1, 1))}
              className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 text-slate-500 transition hover:border-sky-300 hover:text-sky-700 disabled:opacity-30 dark:border-slate-700 dark:text-slate-300"
              aria-label="上一页"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-20 text-center font-semibold text-slate-700 dark:text-slate-200">
              {data.page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((current) => Math.min(current + 1, totalPages))}
              className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 text-slate-500 transition hover:border-sky-300 hover:text-sky-700 disabled:opacity-30 dark:border-slate-700 dark:text-slate-300"
              aria-label="下一页"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  icon,
  tone = "slate"
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
  tone?: "slate" | "green" | "sky";
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div
        className={clsx(
          "flex items-center gap-2 text-xs font-bold",
          tone === "green"
            ? "text-emerald-600 dark:text-emerald-300"
            : tone === "sky"
              ? "text-sky-600 dark:text-sky-300"
              : "text-slate-500 dark:text-slate-400"
        )}
      >
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-black tabular-nums text-slate-950 dark:text-white">{value.toLocaleString("zh-CN")}</div>
    </div>
  );
}

function RoleBadge({ role }: { role: AdminMember["role"] }) {
  return (
    <span
      className={clsx(
        "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold",
        role === "admin"
          ? "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-200"
          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
      )}
    >
      {role === "admin" ? <ShieldCheck className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
      {role === "admin" ? "管理员" : "会员"}
    </span>
  );
}

function PageLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-[420px] items-center justify-center gap-3 text-sm text-slate-500 dark:text-slate-400">
      <Loader2 className="h-5 w-5 animate-spin" />
      {label}
    </div>
  );
}

function AccessState({
  icon,
  title,
  description,
  actionLabel,
  onAction
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <section className="mx-auto mt-16 max-w-xl rounded-lg border border-slate-200 bg-white px-6 py-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-200">
        {icon}
      </span>
      <h1 className="mt-5 text-xl font-black text-slate-950 dark:text-white">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-6 h-10 rounded-lg bg-sky-600 px-5 text-sm font-bold text-white transition hover:bg-sky-700"
        >
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
}
