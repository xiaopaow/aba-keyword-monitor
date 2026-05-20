"use client";

import clsx from "clsx";
import {
  AlertTriangle,
  BarChart3,
  Database,
  LayoutDashboard,
  Menu,
  Moon,
  Search,
  Settings,
  Sparkles,
  Sun,
  Tags
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const navItems = [
  { href: "/", label: "总览看板", icon: LayoutDashboard },
  { href: "/keywords", label: "关键词监控", icon: Search },
  { href: "/opportunities", label: "机会词分析", icon: Sparkles },
  { href: "/alerts", label: "风险预警", icon: AlertTriangle },
  { href: "/import", label: "数据导入", icon: Database }
];

const laterItems = [
  { label: "报表中心", icon: BarChart3 },
  { label: "用户权限", icon: Tags },
  { label: "系统设置", icon: Settings }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-40 w-64 border-r border-border bg-[#06254a] text-white transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="border-b border-white/10 px-5 py-4">
          <div className="text-sm font-semibold">ABA关键词监控系统</div>
          <div className="mt-1 text-xs text-blue-100">Keyword Rank Monitor</div>
        </div>
        <nav className="space-y-1 p-3">
          {navItems.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex h-10 items-center gap-3 rounded-md px-3 text-sm transition",
                  active ? "bg-primary text-white" : "text-blue-50 hover:bg-white/10"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mx-3 mt-4 border-t border-white/10 pt-4">
          <div className="px-3 pb-2 text-xs text-blue-200">第二版规划</div>
          {laterItems.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="flex h-9 items-center gap-3 rounded-md px-3 text-sm text-blue-200/70">
                <Icon className="h-4 w-4" />
                {item.label}
              </div>
            );
          })}
        </div>
      </aside>

      {open && <button aria-label="关闭菜单" className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-card/95 px-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <button
              aria-label="打开菜单"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-border lg:hidden"
              onClick={() => setOpen(true)}
            >
              <Menu className="h-4 w-4" />
            </button>
            <div>
              <div className="text-sm font-semibold">ABA关键词排名监控</div>
              <div className="hidden text-xs text-slate-500 sm:block">只基于 keyword、rank、reportDate 的运营看板</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              aria-label="切换暗黑模式"
              title="切换暗黑模式"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background"
              onClick={() => setDark((value) => !value)}
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>
        <main className="p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
