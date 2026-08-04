"use client";

import type { MemberUser } from "@aba/shared";
import clsx from "clsx";
import {
  CheckCircle2,
  Crown,
  Database,
  FileSpreadsheet,
  Headphones,
  Layers3,
  ShieldCheck,
  Sparkles,
  XCircle
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { WhaleLogo } from "../../components/brand";
import { Badge } from "../../components/ui";
import { createMemberOrder, fetchCurrentMember } from "../../lib/api";

const OPEN_AUTH_EVENT = "deepwhale:open-auth";

const plans = [
  {
    key: "trial",
    name: "体验版",
    label: "开始探索",
    price: "0",
    accent: "bg-slate-400",
    iconTone: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    description: "适合首次体验 ABA 周报，验证搜索词、排名变化和商品机会。",
    benefits: ["查看前 1,000 条结果", "ABA 周报筛选与周排名对比", "关键词复制与 Amazon 跳转", "在可见范围内导出数据"]
  },
  {
    key: "basic",
    name: "专业版",
    label: "个人卖家首选",
    price: "1299",
    accent: "bg-sky-500",
    iconTone: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-200",
    description: "适合个人卖家和小团队，覆盖日常选品、竞品观察和机会筛选。",
    benefits: ["查看前 50,000 条结果", "完整高级筛选与场景筛选", "周排名变化分析", "在可见范围内导出数据"]
  },
  {
    key: "pro",
    name: "商业版",
    label: "高频数据用户",
    price: "2999",
    accent: "bg-emerald-500",
    iconTone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
    description: "适合高频选品和深度翻页用户，开放当前 ABA 周报全部数据。",
    benefits: ["查看全部 ABA 周报数据", "完整筛选、分页与周对比", "Excel 批量导出", "优先数据问题支持"]
  }
] as const;

const comparisonRows: Array<[string, ReactNode, ReactNode, ReactNode]> = [
  ["数据查看范围", "前 1,000 条", "前 50,000 条", "全部数据"],
  ["最新 ABA 周报", true, true, true],
  ["历史周报切换", true, true, true],
  ["排名变化筛选", true, true, true],
  ["关键词复制 / Amazon 跳转", true, true, true],
  ["Excel 导出", "可见范围", "可见范围", "完整范围"],
  ["客户支持", "自助支持", "标准支持", "优先支持"]
];

const planNames: Record<MemberUser["plan"], string> = {
  trial: "体验版",
  basic: "专业版",
  pro: "商业版"
};

const planRanks: Record<MemberUser["plan"], number> = {
  trial: 0,
  basic: 1,
  pro: 2
};

export default function MemberPage() {
  const [member, setMember] = useState<MemberUser | null>(null);
  const [memberResolved, setMemberResolved] = useState(false);
  const [message, setMessage] = useState("");
  const [ordering, setOrdering] = useState("");

  useEffect(() => {
    fetchCurrentMember()
      .then(setMember)
      .finally(() => setMemberResolved(true));
  }, []);

  async function selectPlan(plan: "basic" | "pro", name: string) {
    if (!member) {
      window.dispatchEvent(new CustomEvent(OPEN_AUTH_EVENT, { detail: { mode: "login" } }));
      return;
    }

    setOrdering(name);
    setMessage("");
    try {
      const result = await createMemberOrder(plan);
      setMessage(result?.ok ? `已提交 ${name} 开通意向，我们会联系你确认开通。` : "提交失败，请稍后重试。");
    } finally {
      setOrdering("");
    }
  }

  function startTrial() {
    if (!member) {
      window.dispatchEvent(new CustomEvent(OPEN_AUTH_EVENT, { detail: { mode: "register" } }));
    }
  }

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-80px)] bg-slate-50 px-4 py-6 dark:bg-slate-950 md:-mx-6 md:-my-8 md:px-6 md:py-8">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-8 px-5 py-7 md:px-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
          <div>
            <WhaleLogo className="mb-7" />
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-700 dark:bg-sky-950 dark:text-sky-200">会员方案</span>
              <span className="text-xs text-slate-400">按数据查看深度选择</span>
            </div>
            <h1 className="mt-4 max-w-3xl text-3xl font-black tracking-tight text-slate-950 dark:text-white md:text-4xl">
              选择适合你的 ABA 数据权限
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-400 md:text-base">
              三个版本使用同一套真实 ABA 周报工具，主要区别是可查看的数据深度与支持优先级。
            </p>
          </div>

          <AccountPanel member={member} resolved={memberResolved} />
        </div>

        <div className="grid border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/60 sm:grid-cols-3">
          <ProductFact icon={<Database className="h-4 w-4" />} value="每周更新" label="美国站 ABA 周报" />
          <ProductFact icon={<Layers3 className="h-4 w-4" />} value="真实 MySQL" label="搜索词与前三点击商品" />
          <ProductFact icon={<FileSpreadsheet className="h-4 w-4" />} value="可导出" label="筛选结果与关键词" />
        </div>
      </section>

      <section className="mt-5 grid gap-4 xl:grid-cols-3">
        {plans.map((plan) => (
          <PlanCard
            key={plan.key}
            plan={plan}
            member={member}
            loading={ordering === plan.name}
            onSelect={() => (plan.key === "trial" ? startTrial() : selectPlan(plan.key, plan.name))}
          />
        ))}
      </section>

      {message ? (
        <div className="mt-5 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-700 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-200">
          {message}
        </div>
      ) : null}

      <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-5 dark:border-slate-800 md:px-6">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-black text-slate-950 dark:text-white">会员权益详细对比</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">这里只列出当前系统已经提供的能力。</p>
          </div>
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-950 dark:border-slate-800 dark:bg-slate-950/60 dark:text-white">
                <th className="px-6 py-4 text-left font-black">权益对比</th>
                <th className="px-6 py-4 text-center font-black">体验版</th>
                <th className="px-6 py-4 text-center font-black">专业版</th>
                <th className="px-6 py-4 text-center font-black">商业版</th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row) => (
                <tr key={row[0]} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                  <td className="px-6 py-4 font-medium text-slate-600 dark:text-slate-300">{row[0]}</td>
                  <CompareCell value={row[1]} />
                  <CompareCell value={row[2]} />
                  <CompareCell value={row[3]} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function AccountPanel({ member, resolved }: { member: MemberUser | null; resolved: boolean }) {
  if (!resolved) {
    return <div className="h-[132px] animate-pulse rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950" />;
  }

  if (!member) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-white text-slate-500 shadow-sm dark:bg-slate-900 dark:text-slate-300">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <div className="font-bold text-slate-950 dark:text-white">尚未登录</div>
            <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">注册后默认开通体验版</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">当前账号</div>
          <div className="mt-1 truncate font-bold text-slate-950 dark:text-white" title={member.email}>
            {member.email}
          </div>
        </div>
        <Badge tone={member.status === "active" ? "green" : "slate"}>{member.status === "active" ? "有效" : member.status}</Badge>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4 dark:border-slate-800">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">当前套餐</div>
          <div className="mt-1 font-black text-slate-950 dark:text-white">{planNames[member.plan]}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500 dark:text-slate-400">有效期至</div>
          <div className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
            {member.expiresAt ? new Date(member.expiresAt).toLocaleDateString("zh-CN") : "长期有效"}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductFact({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <div className="flex items-center gap-3 border-slate-200 px-5 py-4 dark:border-slate-800 sm:border-r sm:last:border-r-0 md:px-8">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white text-sky-600 shadow-sm dark:bg-slate-900 dark:text-sky-300">{icon}</span>
      <div>
        <div className="text-sm font-bold text-slate-950 dark:text-white">{value}</div>
        <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{label}</div>
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  member,
  loading,
  onSelect
}: {
  plan: (typeof plans)[number];
  member: MemberUser | null;
  loading: boolean;
  onSelect: () => void;
}) {
  const planKey = plan.key as MemberUser["plan"];
  const currentRank = member ? planRanks[member.plan] : -1;
  const targetRank = planRanks[planKey];
  const isCurrent = member?.plan === planKey;
  const isIncluded = currentRank > targetRank;
  const disabled = loading || isCurrent || isIncluded;
  const buttonLabel = loading
    ? "正在提交..."
    : isCurrent
      ? "当前套餐"
      : isIncluded
        ? "当前套餐已包含"
        : plan.key === "trial"
          ? "免费注册"
          : "提交开通意向";

  return (
    <article
      className={clsx(
        "relative overflow-hidden rounded-xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:bg-slate-900",
        isCurrent ? "border-sky-400 ring-2 ring-sky-100 dark:border-sky-600 dark:ring-sky-950" : "border-slate-200 dark:border-slate-800"
      )}
    >
      <div className={clsx("h-1.5", plan.accent)} />
      <div className="p-5 md:p-6">
        <div className="flex items-start justify-between gap-3">
          <span className={clsx("rounded-md px-2.5 py-1 text-xs font-bold", plan.iconTone)}>{plan.label}</span>
          <span className={clsx("grid h-9 w-9 place-items-center rounded-lg", plan.iconTone)}>
            {plan.key === "pro" ? <Crown className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
          </span>
        </div>

        <div className="mt-5 flex items-center gap-2">
          <h2 className="text-2xl font-black text-slate-950 dark:text-white">{plan.name}</h2>
          {isCurrent ? <Badge tone="blue">当前</Badge> : null}
        </div>
        <p className="mt-2 min-h-[48px] text-sm leading-6 text-slate-500 dark:text-slate-400">{plan.description}</p>

        <div className="mt-6 flex items-end gap-1 text-slate-950 dark:text-white">
          <span className="pb-1 text-xl font-black">¥</span>
          <span className="text-4xl font-black tabular-nums">{plan.price}</span>
          <span className="pb-1 text-sm font-semibold text-slate-500 dark:text-slate-400">{plan.key === "trial" ? " / 永久" : " / 年"}</span>
        </div>

        <div className="mt-6 space-y-3 border-t border-slate-100 pt-5 dark:border-slate-800">
          {plan.benefits.map((benefit) => (
            <div key={benefit} className="flex items-start gap-2.5 text-sm text-slate-600 dark:text-slate-300">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              <span>{benefit}</span>
            </div>
          ))}
        </div>

        <button
          className={clsx(
            "mt-7 h-11 w-full rounded-lg text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:cursor-default",
            disabled
              ? "border border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-500"
              : plan.key === "pro"
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "bg-sky-600 text-white hover:bg-sky-700"
          )}
          disabled={disabled}
          onClick={onSelect}
        >
          {buttonLabel}
        </button>
      </div>
    </article>
  );
}

function CompareCell({ value }: { value: ReactNode }) {
  return (
    <td className="px-6 py-4 text-center text-slate-700 dark:text-slate-300">
      {value === true ? (
        <CheckCircle2 className="mx-auto h-5 w-5 text-emerald-500" />
      ) : value === false ? (
        <XCircle className="mx-auto h-5 w-5 text-rose-500" />
      ) : (
        value
      )}
    </td>
  );
}
