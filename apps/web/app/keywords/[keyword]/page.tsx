"use client";

import { Save, Star } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchKeyword } from "../../../lib/api";
import { Badge, Button, Card, CardHeader, Field, inputClass, MetricCard, PageHeader } from "../../../components/ui";

export default function KeywordDetailPage() {
  const params = useParams<{ keyword: string }>();
  const keyword = decodeURIComponent(params.keyword);
  const [data, setData] = useState<any>(null);
  const [range, setRange] = useState("30d");

  useEffect(() => {
    fetchKeyword(keyword).then(setData);
  }, [keyword]);

  if (!data) return null;

  return (
    <>
      <PageHeader
        title={keyword}
        description="关键词历史趋势、排名变化和运营备注。"
        actions={<Button><Star className="h-4 w-4" />收藏</Button>}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="当前排名" value={data.currentRank ?? "-"} />
        <MetricCard label="昨日排名" value={data.yesterdayRank ?? "-"} />
        <MetricCard label="7天变化" value={data.sevenDayChange ?? "-"} />
        <MetricCard label="30天变化" value={data.thirtyDayChange ?? "-"} />
        <MetricCard label="历史最佳" value={data.bestRank ?? "-"} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_0.8fr]">
        <Card>
          <CardHeader
            title="排名趋势"
            action={
              <select className={inputClass} value={range} onChange={(event) => setRange(event.target.value)}>
                <option value="7d">7天</option>
                <option value="30d">30天</option>
                <option value="90d">90天</option>
                <option value="180d">180天</option>
                <option value="all">全部</option>
              </select>
            }
          />
          <div className="h-96 p-4">
            <ResponsiveContainer>
              <LineChart data={data.trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis reversed fontSize={12} />
                <Tooltip />
                <Line type="monotone" dataKey="rank" name="排名" stroke="#2563eb" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="关键词信息" />
            <div className="space-y-3 p-4 text-sm">
              <Info label="首次出现" value={data.firstSeenDate ?? "-"} />
              <Info label="最近出现" value={data.lastSeenDate ?? "-"} />
              <Info label="历史最差" value={data.worstRank ?? "-"} />
              <Info label="标签" value={<Badge>{data.tag ?? "未标记"}</Badge>} />
            </div>
          </Card>
          <Card>
            <CardHeader title="标签和备注" />
            <div className="space-y-3 p-4">
              <Field label="标签">
                <select className={inputClass} defaultValue={data.tag ?? "核心词"}>
                  <option>核心词</option>
                  <option>长尾词</option>
                  <option>品牌词</option>
                  <option>竞品词</option>
                  <option>产品词</option>
                </select>
              </Field>
              <Field label="备注">
                <textarea className={`${inputClass} h-24 py-2`} placeholder="输入运营备注" />
              </Field>
              <Button className="w-full"><Save className="h-4 w-4" />保存</Button>
            </div>
          </Card>
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader title="历史排名记录" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[540px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800">
              <tr><th className="px-4 py-3 text-left">日期</th><th className="px-4 py-3 text-left">排名</th><th className="px-4 py-3 text-left">较前一日变化</th></tr>
            </thead>
            <tbody>
              {data.trend.map((row: any) => (
                <tr key={row.date} className="border-t border-border">
                  <td className="px-4 py-3">{row.date}</td>
                  <td className="px-4 py-3">{row.rank}</td>
                  <td className="px-4 py-3">{row.changeValue ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-slate-500">{label}</span><span>{value}</span></div>;
}
