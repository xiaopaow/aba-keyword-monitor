"use client";

import clsx from "clsx";
import { CheckCircle2, Crown, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { MemberUser } from "@aba/shared";
import { Badge } from "../../components/ui";
import { WhaleLogo } from "../../components/brand";
import { createMemberOrder, fetchCurrentMember } from "../../lib/api";

const plans = [
  {
    key: "basic",
    name: "专业版",
    label: "个人卖家首选",
    price: "1299",
    tone: "sky",
    description: "适合个人卖家和小团队，覆盖日常选品、竞品观察和关键词机会筛选。",
    benefits: ["每日 1,000 次查询", "可查看前 50,000 条排名", "每日 3 次 Excel 导出", "单账号绑定 1 台设备"]
  },
  {
    key: "pro",
    name: "商业版",
    label: "团队与数据客户",
    price: "2999",
    tone: "emerald",
    description: "适合高频查询、深度翻页和批量导出需求，后续可扩展团队席位。",
    benefits: ["每日 5,000 次查询", "更深数据查看范围", "每日 20 次 Excel 导出", "优先数据补全与问题支持"]
  },
  {
    key: "pro",
    name: "联合版",
    label: "ABA + 商机版",
    price: "3298",
    tone: "violet",
    description: "面向同时关注 ABA 搜索词与商机探索的团队，预留后续模块升级空间。",
    benefits: ["包含商业版全部权益", "预留商机模块权限", "优先功能内测", "年度运营支持"]
  }
] as const;

const comparisonRows = [
  ["主账号", "1", "1", "1"],
  ["美国站点", true, true, true],
  ["其他站点", false, "规划中", "规划中"],
  ["市场挖掘", true, true, true],
  ["搜索趋势查询", true, true, true],
  ["商品搜索查询", true, true, true],
  ["商品趋势历史月份", "12个月", "48个月", "48个月"],
  ["Excel 下载", "每日 3 次", "每日 20 次", "每日 20 次"],
  ["问题支持", "标准支持", "优先支持", "优先支持"]
];

export default function MemberPage() {
  const [member, setMember] = useState<MemberUser | null>(null);
  const [message, setMessage] = useState("");
  const [ordering, setOrdering] = useState("");

  useEffect(() => {
    fetchCurrentMember().then(setMember);
  }, []);

  async function selectPlan(plan: "basic" | "pro", name: string) {
    setOrdering(name);
    setMessage("");
    try {
      const result = await createMemberOrder(plan);
      setMessage(result?.ok ? `已提交 ${name} 套餐意向，订单状态：${result.status ?? "pending"}` : "提交失败，请稍后重试。");
    } finally {
      setOrdering("");
    }
  }

  return (
    <div className="-mx-6 -my-8 min-h-[calc(100vh-80px)] bg-[radial-gradient(circle_at_top_right,#ccfbf1_0,transparent_34%),radial-gradient(circle_at_top_left,#dbeafe_0,transparent_38%),linear-gradient(180deg,#f8fbff_0%,#ffffff_56%)] px-6 py-8">
      <section className="mb-6 rounded-3xl border border-white/80 bg-white/75 p-8 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <WhaleLogo className="mb-8" />
            <span className="inline-flex rounded-lg bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">会员中心</span>
            <h1 className="mt-5 text-4xl font-black tracking-tight text-slate-950">选择适合你的 ABA 数据权限</h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
              深海鲸行采用人工开通模式。你可以先提交套餐意向，确认付款后由管理员为账号升级会员权限。
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600 shadow-sm">
            {member ? (
              <div className="space-y-2">
                <div className="font-bold text-slate-950">{member.email}</div>
                <div className="flex items-center gap-2">
                  <Badge tone={member.status === "active" ? "green" : "slate"}>{member.status}</Badge>
                  <Badge tone={member.plan === "pro" ? "amber" : "blue"}>{member.plan.toUpperCase()}</Badge>
                </div>
                <div>有效期：{member.expiresAt ? new Date(member.expiresAt).toLocaleDateString("zh-CN") : "登录后显示"}</div>
                <div>设备：{member.deviceBound ? "已绑定" : "首次登录自动绑定"}</div>
              </div>
            ) : (
              "未登录，请选择套餐前先登录"
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        {plans.map((plan) => (
          <PlanCard
            key={`${plan.name}-${plan.price}`}
            plan={plan}
            loading={ordering === plan.name}
            onSelect={() => selectPlan(plan.key, plan.name)}
          />
        ))}
      </section>

      {message ? <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm font-medium text-sky-700">{message}</div> : null}

      <section className="mt-7 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-start gap-3 border-b border-slate-200 px-6 py-5">
          <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-500" />
          <div>
            <h2 className="text-lg font-black text-slate-950">会员权益详细对比</h2>
            <p className="mt-1 text-sm text-slate-500">第一版只展示与当前 ABA 数据产品直接相关的权益。</p>
          </div>
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-950">
                <th className="px-6 py-5 text-left text-base font-black">权益对比</th>
                <th className="px-6 py-5 text-center text-base font-black">专业版</th>
                <th className="px-6 py-5 text-center text-base font-black">商业版</th>
                <th className="px-6 py-5 text-center text-base font-black">联合版</th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row) => (
                <tr key={row[0] as string} className="border-b border-slate-100 last:border-0">
                  <td className="px-6 py-4 font-medium text-slate-600">{row[0]}</td>
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

function PlanCard({
  plan,
  loading,
  onSelect
}: {
  plan: (typeof plans)[number];
  loading: boolean;
  onSelect: () => void;
}) {
  const toneClass = {
    sky: "from-sky-500 to-cyan-500 text-sky-700 bg-sky-50",
    emerald: "from-emerald-500 to-teal-500 text-emerald-700 bg-emerald-50",
    violet: "from-violet-500 to-fuchsia-500 text-violet-700 bg-violet-50"
  }[plan.tone];

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className={clsx("h-2 bg-gradient-to-r", toneClass.split(" ").slice(0, 2).join(" "))} />
      <div className="p-6">
        <div className="flex items-start justify-between">
          <span className={clsx("rounded-lg px-3 py-1 text-xs font-bold", toneClass.split(" ").slice(2).join(" "))}>{plan.label}</span>
          {plan.name === "商业版" ? <Crown className="h-7 w-7 text-amber-500" /> : <Sparkles className="h-7 w-7 text-sky-500" />}
        </div>
        <h2 className="mt-6 text-2xl font-black text-slate-950">{plan.name}</h2>
        <p className="mt-3 min-h-[52px] text-sm leading-7 text-slate-500">{plan.description}</p>
        <div className="mt-7 flex items-end gap-2 text-slate-950">
          <span className="text-2xl font-black">¥</span>
          <span className="text-5xl font-black tracking-tight">{plan.price}</span>
          <span className="pb-2 text-lg font-bold">/ 年</span>
        </div>
        <div className="mt-7 space-y-3">
          {plan.benefits.map((benefit) => (
            <div key={benefit} className="flex items-center gap-3 text-sm text-slate-600">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              {benefit}
            </div>
          ))}
        </div>
        <button
          className="mt-8 h-11 w-full rounded-lg bg-blue-600 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
          disabled={loading}
          onClick={onSelect}
        >
          {loading ? "正在提交..." : "选择套餐"}
        </button>
      </div>
    </article>
  );
}

function CompareCell({ value }: { value: ReactNode }) {
  return (
    <td className="px-6 py-4 text-center text-slate-700">
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
