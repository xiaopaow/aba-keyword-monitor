"use client";

import type { AbaSearchTermRow, AbaWeek, ChangeType } from "@aba/shared";
import { RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Field, inputClass, PageHeader } from "../components/ui";
import { fetchAbaSearchTerms, fetchAbaWeeks } from "../lib/api";

const changeLabels: Record<ChangeType, string> = {
  new: "新词/潜力词",
  lost: "消失",
  up: "上升",
  down: "下降",
  flat: "无变化"
};

const changeTones: Record<ChangeType, "blue" | "green" | "red" | "yellow" | "slate"> = {
  new: "blue",
  lost: "yellow",
  up: "green",
  down: "red",
  flat: "slate"
};

export default function AbaSearchTermsPage() {
  const [weeks, setWeeks] = useState<AbaWeek[]>([]);
  const [weekStart, setWeekStart] = useState("");
  const [compareWeekStart, setCompareWeekStart] = useState("");
  const [keyword, setKeyword] = useState("");
  const [excludeKeyword, setExcludeKeyword] = useState("");
  const [asin, setAsin] = useState("");
  const [rankMin, setRankMin] = useState("");
  const [rankMax, setRankMax] = useState("");
  const [clickShareMin, setClickShareMin] = useState("");
  const [clickShareMax, setClickShareMax] = useState("");
  const [conversionShareMin, setConversionShareMin] = useState("");
  const [conversionShareMax, setConversionShareMax] = useState("");
  const [changeType, setChangeType] = useState("all");
  const [sort, setSort] = useState("rank");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [data, setData] = useState({ rows: [] as AbaSearchTermRow[], total: 0, weekStart: null as string | null, weekEnd: null as string | null });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAbaWeeks().then((items) => {
      setWeeks(items);
      setWeekStart((value) => value || items[0]?.periodStart || "");
      setCompareWeekStart((value) => value || items[1]?.periodStart || "");
    });
  }, []);

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, compareWeekStart, page, pageSize]);

  const currentWeek = weeks.find((week) => week.periodStart === weekStart);
  const compareWeek = weeks.find((week) => week.periodStart === compareWeekStart);
  const totalPages = Math.max(1, Math.ceil(data.total / pageSize));
  const summary = useMemo(() => summarizeRows(data.rows), [data.rows]);

  async function loadData(nextPage = page) {
    setLoading(true);
    const result = await fetchAbaSearchTerms({
      weekStart,
      compareWeekStart,
      keyword,
      excludeKeyword,
      asin,
      rankMin,
      rankMax,
      clickShareMin,
      clickShareMax,
      conversionShareMin,
      conversionShareMax,
      changeType,
      sort,
      page: nextPage,
      pageSize
    });
    setData(result);
    setPage(result.page);
    setLoading(false);
  }

  function searchNow() {
    setPage(1);
    void loadData(1);
  }

  function resetFilters() {
    setKeyword("");
    setExcludeKeyword("");
    setAsin("");
    setRankMin("");
    setRankMax("");
    setClickShareMin("");
    setClickShareMax("");
    setConversionShareMin("");
    setConversionShareMax("");
    setChangeType("all");
    setSort("rank");
    setPage(1);
  }

  return (
    <>
      <PageHeader
        title="亚马逊 ABA 热门搜索词"
        description="按每周 ABA 报告展示搜索词排名、周排名变化和前三点击商品。当前仅做美国站。"
        actions={
          <Button onClick={searchNow} disabled={loading}>
            <Search className="h-4 w-4" />
            确认搜索
          </Button>
        }
      />

      <section className="mb-4 rounded-lg border border-border bg-card p-4">
        <div className="mb-4 flex items-start gap-3 border-b border-border pb-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-rose-500 text-white">
            <Search className="h-7 w-7" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">ABA 搜索词周报</h2>
            <p className="mt-1 text-sm text-slate-500">
              一行一个搜索词，点击商品按 clickShareRank 聚合前三名。新词/潜力词表示本周出现、对比周未出现。
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="选择站点">
            <select className={inputClass} disabled value="US">
              <option value="US">美国</option>
            </select>
          </Field>
          <Field label="报告时间">
            <select className={inputClass} value={weekStart} onChange={(event) => setWeekStart(event.target.value)}>
              {weeks.map((week) => (
                <option key={week.id} value={week.periodStart}>
                  {week.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="对比时间">
            <select className={inputClass} value={compareWeekStart} onChange={(event) => setCompareWeekStart(event.target.value)}>
              <option value="">不对比</option>
              {weeks.map((week) => (
                <option key={week.id} value={week.periodStart}>
                  {week.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="变化类型">
            <select className={inputClass} value={changeType} onChange={(event) => setChangeType(event.target.value)}>
              <option value="all">全部</option>
              <option value="new">新词/潜力词</option>
              <option value="up">排名上升</option>
              <option value="down">排名下降</option>
              <option value="flat">无变化</option>
            </select>
          </Field>
          <Field label="包含关键词">
            <input className={inputClass} value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="输入需要包含的关键词" />
          </Field>
          <Field label="排除关键词">
            <input
              className={inputClass}
              value={excludeKeyword}
              onChange={(event) => setExcludeKeyword(event.target.value)}
              placeholder="输入需要排除的关键词"
            />
          </Field>
          <Field label="ASIN">
            <input className={inputClass} value={asin} onChange={(event) => setAsin(event.target.value)} placeholder="精确输入 ASIN" />
          </Field>
          <Field label="排序">
            <select className={inputClass} value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="rank">搜索排名</option>
              <option value="rankChange">排名变化</option>
              <option value="clickShare">点击份额</option>
              <option value="conversionShare">转化份额</option>
              <option value="keyword">搜索词</option>
            </select>
          </Field>
          <RangeField label="搜索排名" min={rankMin} max={rankMax} onMin={setRankMin} onMax={setRankMax} />
          <RangeField label="点击份额 %" min={clickShareMin} max={clickShareMax} onMin={setClickShareMin} onMax={setClickShareMax} />
          <RangeField label="转化份额 %" min={conversionShareMin} max={conversionShareMax} onMin={setConversionShareMin} onMax={setConversionShareMax} />
          <div className="flex items-end gap-2">
            <Button className="flex-1" onClick={searchNow} disabled={loading}>
              <SlidersHorizontal className="h-4 w-4" />
              筛选
            </Button>
            <button className="h-9 rounded-md border border-border px-3 text-sm" onClick={resetFilters} title="清空筛选">
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="当前周" value={currentWeek?.label ?? data.weekStart ?? "-"} />
        <Metric label="对比周" value={compareWeek?.label ?? "上一周"} />
        <Metric label="查询结果" value={data.total.toLocaleString()} />
        <Metric label="本页新词" value={summary.newCount} />
        <Metric label="本页上升/下降" value={`${summary.upCount}/${summary.downCount}`} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="text-sm text-slate-500">
            共 <span className="font-semibold text-foreground">{data.total.toLocaleString()}</span> 条结果，当前第 {page} / {totalPages} 页
          </div>
          <div className="flex items-center gap-2 text-sm">
            <select className={inputClass} value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>
              <option value={50}>50 条/页</option>
              <option value={100}>100 条/页</option>
              <option value={200}>200 条/页</option>
            </select>
            <button className="h-9 rounded-md border border-border px-3 disabled:opacity-50" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              上一页
            </button>
            <button className="h-9 rounded-md border border-border px-3 disabled:opacity-50" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              下一页
            </button>
          </div>
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[1280px] text-sm">
            <thead className="bg-slate-100 text-xs text-slate-500 dark:bg-slate-800">
              <tr>
                <th className="px-4 py-3 text-left">搜索词</th>
                <th className="px-4 py-3 text-right">搜索排名</th>
                <th className="px-4 py-3 text-right">对比排名</th>
                <th className="px-4 py-3 text-right">排名变化</th>
                <th className="px-4 py-3 text-left">状态</th>
                <th className="px-4 py-3 text-left">#1 商品详情/点击份额/转化份额</th>
                <th className="px-4 py-3 text-left">#2 商品详情/点击份额/转化份额</th>
                <th className="px-4 py-3 text-left">#3 商品详情/点击份额/转化份额</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <SearchTermRow key={row.keyword} row={row} />
              ))}
              {!data.rows.length && (
                <tr>
                  <td className="px-4 py-16 text-center text-slate-500" colSpan={8}>
                    {loading ? "正在加载..." : "还没有搜索词数据。请先到数据导入页导入每周 ABA JSON。"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function RangeField({
  label,
  min,
  max,
  onMin,
  onMax
}: {
  label: string;
  min: string;
  max: string;
  onMin: (value: string) => void;
  onMax: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="grid grid-cols-2 gap-2">
        <input className={inputClass} value={min} onChange={(event) => onMin(event.target.value)} placeholder="最小值" />
        <input className={inputClass} value={max} onChange={(event) => onMax(event.target.value)} placeholder="最大值" />
      </div>
    </Field>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-2 truncate text-lg font-semibold">{value}</div>
    </div>
  );
}

function SearchTermRow({ row }: { row: AbaSearchTermRow }) {
  return (
    <tr className="border-t border-border align-top">
      <td className="max-w-[260px] px-4 py-4">
        <div className="font-semibold">{row.keyword}</div>
        {row.departmentName && <div className="mt-1 text-xs text-slate-500">{row.departmentName}</div>}
      </td>
      <td className="px-4 py-4 text-right font-medium">{formatRank(row.currentRank)}</td>
      <td className="px-4 py-4 text-right">{formatRank(row.compareRank)}</td>
      <td className={`px-4 py-4 text-right font-medium ${rankChangeClass(row.rankChange)}`}>{formatChange(row.rankChange)}</td>
      <td className="px-4 py-4">
        <Badge tone={changeTones[row.changeType]}>{changeLabels[row.changeType]}</Badge>
      </td>
      {[0, 1, 2].map((index) => (
        <td key={index} className="w-[260px] px-4 py-4">
          <ProductCell product={row.topProducts[index]} />
        </td>
      ))}
    </tr>
  );
}

function ProductCell({ product }: { product: AbaSearchTermRow["topProducts"][number] | undefined }) {
  if (!product) return <span className="text-slate-400">-</span>;
  return (
    <div className="space-y-1">
      <div className="line-clamp-2 text-sm">{product.itemName || "-"}</div>
      {product.asin && <div className="font-medium text-blue-600">{product.asin}</div>}
      <div className="text-xs text-slate-500">
        点击：{formatPercent(product.clickShare)}　转化：{formatPercent(product.conversionShare)}
      </div>
    </div>
  );
}

function summarizeRows(rows: AbaSearchTermRow[]) {
  return {
    newCount: rows.filter((row) => row.changeType === "new").length,
    upCount: rows.filter((row) => row.changeType === "up").length,
    downCount: rows.filter((row) => row.changeType === "down").length
  };
}

function formatRank(value: number | null) {
  return value === null ? "-" : value.toLocaleString();
}

function formatChange(value: number | null) {
  if (value === null) return "-";
  if (value > 0) return `▲ ${value.toLocaleString()}`;
  if (value < 0) return `▼ ${Math.abs(value).toLocaleString()}`;
  return "0";
}

function rankChangeClass(value: number | null) {
  if (value === null) return "text-blue-600";
  if (value > 0) return "text-emerald-600";
  if (value < 0) return "text-rose-600";
  return "text-slate-500";
}

function formatPercent(value: number | null) {
  if (value === null) return "-";
  return `${(value * 100).toFixed(2)}%`;
}
