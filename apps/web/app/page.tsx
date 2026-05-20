"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchDashboard } from "../lib/api";
import { Button, Card, CardHeader, Field, Filters, inputClass, MetricCard, PageHeader } from "../components/ui";

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetchDashboard().then(setData);
  }, []);

  if (!data) return null;
  const summary = data.summary;

  return (
    <>
      <PageHeader
        title="总览看板"
        description="核心指标概览，快速了解整体关键词表现和趋势变化。"
        actions={
          <Button onClick={() => fetchDashboard().then(setData)}>
            <RefreshCw className="h-4 w-4" />
            刷新
          </Button>
        }
      />
      <Filters>
        <Field label="数据日期">
          <input className={inputClass} type="date" defaultValue="2026-05-20" />
        </Field>
        <Field label="对比日期">
          <input className={inputClass} type="date" defaultValue="2026-05-19" />
        </Field>
        <Field label="排名区间">
          <select className={inputClass} defaultValue="all">
            <option value="all">全部</option>
            <option value="top100">Top100</option>
            <option value="top1000">Top1000</option>
            <option value="top10000">Top10000</option>
          </select>
        </Field>
        <Field label="关键词搜索">
          <input className={inputClass} placeholder="输入关键词" />
        </Field>
      </Filters>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="今日关键词总数" value={summary.totalKeywords.toLocaleString()} delta="+2.1%" />
        <MetricCard label="新增关键词" value={summary.newKeywords.toLocaleString()} delta="+12.4%" />
        <MetricCard label="消失关键词" value={summary.lostKeywords.toLocaleString()} delta="-3.6%" />
        <MetricCard label="上涨关键词" value={summary.upKeywords.toLocaleString()} delta="+7.1%" />
        <MetricCard label="下降关键词" value={summary.downKeywords.toLocaleString()} delta="-4.2%" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <Card>
          <CardHeader title="排名区间分布" />
          <div className="h-80 p-4">
            <ResponsiveContainer>
              <BarChart data={data.distribution}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Bar dataKey="value" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="30天趋势" />
          <div className="h-80 p-4">
            <ResponsiveContainer>
              <LineChart data={data.trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="totalKeywords" name="关键词总数" stroke="#2563eb" dot={false} />
                <Line type="monotone" dataKey="newKeywords" name="新增" stroke="#16a34a" dot={false} />
                <Line type="monotone" dataKey="lostKeywords" name="消失" stroke="#f97316" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <RankList title="排名提升 TOP20" rows={data.topUp} />
        <RankList title="排名下降 TOP20" rows={data.topDown} />
      </div>
    </>
  );
}

function RankList({ title, rows }: { title: string; rows: any[] }) {
  return (
    <Card>
      <CardHeader title={title} />
      <div className="divide-y divide-border">
        {rows.slice(0, 10).map((row) => (
          <div key={row.keyword} className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="truncate pr-4">{row.keyword}</span>
            <span className={row.changeValue > 0 ? "text-emerald-600" : "text-rose-600"}>{row.changeValue > 0 ? "+" : ""}{row.changeValue}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
