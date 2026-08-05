"use client";

import clsx from "clsx";
import { ArrowUp, BarChart3, Headphones, LogIn, LogOut, Moon, ShieldCheck, Sun, UserPlus, UserRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import type { MemberUser } from "@aba/shared";
import { fetchCurrentMember, loginMember, logoutMember, registerMember } from "../lib/api";
import { WhaleLogo } from "./brand";

const navItems = [
  { href: "/", label: "搜索词周报", icon: BarChart3 },
  { href: "/member", label: "会员中心", icon: UserRound }
];

const adminNavItem = { href: "/admin/members", label: "账号管理", icon: ShieldCheck };

const AUTH_CHANGED_EVENT = "deepwhale:auth-changed";
const OPEN_AUTH_EVENT = "deepwhale:open-auth";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

function normalizeAuthError(error: string, mode: "login" | "register") {
  if (/at least 6|至少\s*6/i.test(error)) return "密码至少 6 位。";
  if (/at least 8|至少\s*8/i.test(error)) return "密码至少 8 位。";
  if (/valid email|email required|邮箱/i.test(error)) return "请输入有效邮箱。";
  if (/already registered|已注册/i.test(error)) return "这个邮箱已经注册，请直接登录。";
  if (/invalid email or password|password/i.test(error)) return "账号或密码错误。";
  if (/expired/i.test(error)) return "会员已过期，请续费后继续使用。";
  if (/network/i.test(error)) return "无法连接后端服务，请确认 API 已启动。";
  return mode === "login" ? "登录失败，请检查账号密码。" : "注册失败，请稍后重试。";
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
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const [darkMode, setDarkMode] = useState(false);
  const [searchHref, setSearchHref] = useState("/");
  const [supportOpen, setSupportOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    fetchCurrentMember()
      .then(setMember)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("deepwhale-theme");
    const preferDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
    const nextDark = saved ? saved === "dark" : preferDark;
    setDarkMode(nextDark);
    document.documentElement.classList.toggle("dark", nextDark);
  }, []);

  useEffect(() => {
    const savedSearch = window.localStorage.getItem("deepwhale-last-search-url");
    if (savedSearch?.startsWith("/")) setSearchHref(savedSearch);
  }, [pathname]);

  useEffect(() => {
    function handleOpenAuth(event: Event) {
      const detail = (event as CustomEvent<{ mode?: "login" | "register" }>).detail;
      openAuth(detail?.mode === "register" ? "register" : "login");
    }

    window.addEventListener(OPEN_AUTH_EVENT, handleOpenAuth);
    return () => window.removeEventListener(OPEN_AUTH_EVENT, handleOpenAuth);
  }, []);

  useEffect(() => {
    function handleScroll() {
      setShowScrollTop(window.scrollY > 600);
    }

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  function toggleTheme() {
    setDarkMode((current) => {
      const next = !current;
      document.documentElement.classList.toggle("dark", next);
      window.localStorage.setItem("deepwhale-theme", next ? "dark" : "light");
      return next;
    });
  }

  function openAuth(nextMode: "login" | "register" = "login") {
    setMode(nextMode);
    setError("");
    setAuthOpen(true);
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const nextEmail = email.trim().toLowerCase();
    if (!nextEmail.includes("@")) {
      setError("请输入有效邮箱。");
      return;
    }
    if (!password) {
      setError("请输入密码。");
      return;
    }
    if (mode === "register" && password.length < 6) {
      setError("密码至少 6 位。");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const result = mode === "login" ? await loginMember(nextEmail, password) : await registerMember(nextEmail, password);
      if (!result.data) {
        setError(normalizeAuthError(result.error, mode));
        return;
      }
      setMember(result.data);
      setAuthOpen(false);
      window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logoutMember();
      setMember(null);
      window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT));
    } finally {
      setLoggingOut(false);
    }
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const visibleNavItems = member?.role === "admin" ? [...navItems, adminNavItem] : navItems;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 transition-colors dark:bg-slate-950 dark:text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex h-16 max-w-[1750px] items-center justify-between px-4 md:h-20 md:px-6">
          <WhaleLogo />

          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-2 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:flex">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const activeItem = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href === "/" ? searchHref : item.href}
                  className={clsx(
                    "inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition",
                    activeItem
                      ? "bg-sky-50 text-sky-700 shadow-sm ring-1 ring-sky-100 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-900"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden h-9 items-center gap-2 rounded-full bg-emerald-50 px-4 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200 sm:inline-flex">
              数据源在线
            </div>
            {!loading && member ? (
              <div className="hidden items-center gap-2 sm:flex">
                <Link
                  href="/member"
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:border-sky-200 hover:text-sky-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                >
                  {member.plan.toUpperCase()} · {member.email}
                </Link>
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 shadow-sm transition hover:border-orange-200 hover:text-orange-600 disabled:cursor-wait disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-orange-900 dark:hover:text-orange-300"
                  onClick={handleLogout}
                  disabled={loggingOut}
                >
                  <LogOut className="h-3.5 w-3.5" />
                  {loggingOut ? "退出中" : "退出"}
                </button>
              </div>
            ) : null}
            {!loading && member ? (
              <button
                type="button"
                className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-orange-200 hover:text-orange-600 disabled:cursor-wait disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 sm:hidden"
                onClick={handleLogout}
                disabled={loggingOut}
                aria-label={loggingOut ? "退出中" : "退出登录"}
                title={loggingOut ? "退出中" : "退出登录"}
              >
                <LogOut className="h-4 w-4" />
              </button>
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
              aria-label={darkMode ? "切换浅色模式" : "切换深色模式"}
              title={darkMode ? "切换浅色模式" : "切换深色模式"}
              className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-sky-200 hover:text-sky-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-white md:h-11 md:w-11 md:rounded-xl"
              onClick={toggleTheme}
            >
              {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
          </div>
        </div>
        <nav
          className={clsx(
            "grid border-t border-slate-100 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950 md:hidden",
            visibleNavItems.length === 3 ? "grid-cols-3" : "grid-cols-2"
          )}
        >
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const activeItem = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href === "/" ? searchHref : item.href}
                className={clsx(
                  "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition",
                  activeItem
                    ? "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-200"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.href === "/member" && member ? `${member.plan.toUpperCase()} 会员` : item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-[1750px] px-4 py-6 md:px-6 md:py-8">{children}</main>

      <div className="fixed bottom-4 right-3 z-40 flex flex-col items-end gap-2 md:bottom-24 md:right-5 md:gap-3">
        <div
          className="group relative"
          onMouseEnter={() => setSupportOpen(true)}
          onMouseLeave={() => setSupportOpen(false)}
        >
          <button
            type="button"
            aria-label="联系客服"
            title="联系客服"
            className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-lg transition hover:border-sky-200 hover:text-sky-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:text-sky-300 md:h-12 md:w-12"
            onClick={() => setSupportOpen((value) => !value)}
            onFocus={() => setSupportOpen(true)}
          >
            <Headphones className="h-5 w-5" />
          </button>
          <div
            className={clsx(
              "absolute bottom-0 right-14 w-52 rounded-xl border border-slate-200 bg-white p-3 text-center shadow-xl transition dark:border-slate-800 dark:bg-slate-900",
              supportOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
            )}
          >
            <img className="h-44 w-full rounded-lg bg-white object-contain" src="/customer-wechat.jpg" alt="客服微信二维码" />
            <div className="mt-2 text-sm font-bold text-slate-800 dark:text-slate-100">扫码添加客服</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">微信咨询会员与数据问题</div>
          </div>
        </div>
        {showScrollTop ? (
          <button
            type="button"
            aria-label="回到顶部"
            title="回到顶部"
            className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-lg transition hover:border-orange-200 hover:text-orange-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:text-orange-300 md:h-12 md:w-12"
            onClick={scrollToTop}
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      {authOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <section className="relative w-full max-w-[520px] rounded-2xl border border-slate-200 bg-white p-7 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <button
              type="button"
              aria-label="关闭登录弹窗"
              className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
              onClick={() => setAuthOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex flex-col items-center text-center">
              <WhaleLogo compact />
              <h2 className="mt-5 text-2xl font-black text-slate-950 dark:text-white">
                {mode === "login" ? "登录深海鲸行" : "注册深海鲸行"}
              </h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">登录后即可使用与你套餐对应的数据权限。</p>
            </div>

            <div className="mt-7 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-bold dark:bg-slate-800">
              <button
                type="button"
                className={clsx(
                  "inline-flex h-10 items-center justify-center gap-2 rounded-lg transition",
                  mode === "login" ? "bg-white text-sky-700 shadow-sm dark:bg-slate-950 dark:text-sky-200" : "text-slate-500 dark:text-slate-400"
                )}
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
                className={clsx(
                  "inline-flex h-10 items-center justify-center gap-2 rounded-lg transition",
                  mode === "register" ? "bg-white text-sky-700 shadow-sm dark:bg-slate-950 dark:text-sky-200" : "text-slate-500 dark:text-slate-400"
                )}
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
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">邮箱</span>
                <input
                  autoComplete="email"
                  className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-blue-50 px-4 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">密码</span>
                <input
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-blue-50 px-4 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
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
              {error ? <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600 dark:bg-rose-950/40 dark:text-rose-200">{error}</div> : null}
            </form>

            <div className="mt-6 flex items-center justify-between text-sm">
              <button
                type="button"
                className="font-medium text-sky-600 dark:text-sky-300"
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
