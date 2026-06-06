"use client";

import clsx from "clsx";
import { BarChart3, LogIn, Moon, UserPlus, UserRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import type { MemberUser } from "@aba/shared";
import { fetchCurrentMember, loginMember, registerMember } from "../lib/api";
import { WhaleLogo } from "./brand";

const navItems = [
  { href: "/", label: "搜索词周报", icon: BarChart3 },
  { href: "/member", label: "会员中心", icon: UserRound }
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [member, setMember] = useState<MemberUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("demo@deepwhale.local");
  const [password, setPassword] = useState("demo123456");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchCurrentMember()
      .then(setMember)
      .finally(() => setLoading(false));
  }, []);

  function openAuth(nextMode: "login" | "register" = "login") {
    setMode(nextMode);
    setError("");
    setAuthOpen(true);
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const nextMember = mode === "login" ? await loginMember(email, password) : await registerMember(email, password);
      if (!nextMember) {
        setError(mode === "login" ? "登录失败，请检查账号密码或设备绑定状态。" : "注册失败，请换一个邮箱或稍后重试。");
        return;
      }
      setMember(nextMember);
      setAuthOpen(false);
      window.location.reload();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-20 max-w-[1750px] items-center justify-between px-6">
          <WhaleLogo />

          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-2 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm md:flex">
            {navItems.map((item) => {
              const Icon = item.icon;
              const activeItem = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition",
                    activeItem
                      ? "bg-sky-50 text-sky-700 shadow-sm ring-1 ring-sky-100"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden h-9 items-center gap-2 rounded-full bg-emerald-50 px-4 text-xs font-bold text-emerald-700 sm:inline-flex">
              数据源在线
            </div>
            {!loading && member ? (
              <Link
                href="/member"
                className="hidden rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:border-sky-200 hover:text-sky-700 sm:inline-flex"
              >
                {member.plan.toUpperCase()} · {member.email}
              </Link>
            ) : null}
            {!loading && !member ? (
              <button
                type="button"
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-orange-500 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-orange-600"
                onClick={() => openAuth("login")}
              >
                <LogIn className="h-4 w-4" />
                登录/注册
              </button>
            ) : null}
            <button
              type="button"
              aria-label="Toggle theme"
              className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm"
            >
              <Moon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1750px] px-6 py-8">{children}</main>

      {authOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <section className="relative w-full max-w-[520px] rounded-2xl border border-slate-200 bg-white p-7 shadow-2xl">
            <button
              type="button"
              aria-label="关闭登录弹窗"
              className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              onClick={() => setAuthOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex flex-col items-center text-center">
              <WhaleLogo compact />
              <h2 className="mt-5 text-2xl font-black text-slate-950">
                {mode === "login" ? "登录深海鲸行" : "注册深海鲸行"}
              </h2>
              <p className="mt-2 text-sm text-slate-500">单账号默认绑定 1 台设备，保护你的会员权益。</p>
            </div>

            <div className="mt-7 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-bold">
              <button
                type="button"
                className={clsx("inline-flex h-10 items-center justify-center gap-2 rounded-lg", mode === "login" ? "bg-white text-sky-700 shadow-sm" : "text-slate-500")}
                onClick={() => {
                  setMode("login");
                  setError("");
                }}
              >
                <LogIn className="h-4 w-4" />
                登录
              </button>
              <button
                type="button"
                className={clsx("inline-flex h-10 items-center justify-center gap-2 rounded-lg", mode === "register" ? "bg-white text-sky-700 shadow-sm" : "text-slate-500")}
                onClick={() => {
                  setMode("register");
                  setError("");
                }}
              >
                <UserPlus className="h-4 w-4" />
                注册
              </button>
            </div>

            <form className="mt-6 space-y-5" onSubmit={handleAuth}>
              <label className="block">
                <span className="text-sm font-medium text-slate-600">邮箱</span>
                <input
                  className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-blue-50 px-4 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-600">密码</span>
                <input
                  className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-blue-50 px-4 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <button
                className="h-12 w-full rounded-lg bg-orange-500 text-sm font-bold text-white shadow-sm transition hover:bg-orange-600 disabled:opacity-60"
                disabled={submitting}
              >
                {submitting ? "正在提交..." : mode === "login" ? "登录" : "立即注册"}
              </button>
              {error ? <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div> : null}
            </form>

            <div className="mt-6 flex items-center justify-between text-sm">
              <button
                type="button"
                className="font-medium text-sky-600"
                onClick={() => {
                  setMode(mode === "login" ? "register" : "login");
                  setError("");
                }}
              >
                {mode === "login" ? "没有账号？立即注册" : "已有账号？返回登录"}
              </button>
              <span className="text-slate-400">忘记密码</span>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
