"use client";

import type { AbaSearchTermRow, AbaWeek, ChangeType } from "@aba/shared";
import { Copy, Download, ExternalLink, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Field, inputClass, PageHeader } from "../components/ui";
import { fetchAbaSearchTerms, fetchAbaSearchTermsExport, fetchAbaWeeks } from "../lib/api";

type FilterState = {
  keyword: string;
  excludeKeyword: string;
  asin: string;
  rankMin: string;
  rankMax: string;
  clickShareMin: string;
  clickShareMax: string;
  conversionShareMin: string;
  conversionShareMax: string;
  changeType: ChangeType | "all";
  sort: "rank" | "rankChange" | "clickShare" | "conversionShare" | "keyword";
};

const emptyFilters: FilterState = {
  keyword: "",
  excludeKeyword: "",
  asin: "",
  rankMin: "",
  rankMax: "",
  clickShareMin: "",
  clickShareMax: "",
  conversionShareMin: "",
  conversionShareMax: "",
  changeType: "all",
  sort: "rank"
};

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
  const [draftFilters, setDraftFilters] = useState<FilterState>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(emptyFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [jumpPage, setJumpPage] = useState("1");
  const [data, setData] = useState({
    rows: [] as AbaSearchTermRow[],
    total: 0,
    weekStart: null as string | null,
    weekEnd: null as string | null,
    compareWeekStart: null as string | null
  });
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");

  useEffect(() => {
    fetchAbaWeeks().then((items) => {
      setWeeks(items);
      setWeekStart((value) => value || items[0]?.periodStart || "");
      setCompareWeekStart((value) => value || items[1]?.periodStart || "");
    });
  }, []);

  useEffect(() => {
    if (!weekStart) return;
    void loadData(page, pageSize, appliedFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, compareWeekStart, page, pageSize, appliedFilters]);

  useEffect(() => {
    setJumpPage(String(page));
  }, [page]);

  const currentWeek = weeks.find((week) => week.periodStart === weekStart);
  const compareWeek = weeks.find((week) => week.periodStart === compareWeekStart);
  const totalPages = Math.max(1, Math.ceil(data.total / pageSize));
  const summary = useMemo(() => summarizeRows(data.rows), [data.rows]);
  const resultActions = (
    <ResultActions
      loading={loading}
      exporting={exporting}
      hasRows={data.rows.length > 0}
      copyMessage={copyMessage}
      exportMessage={exportMessage}
      onCopy={copyCurrentPageKeywords}
      onExport={exportExcel}
    />
  );

  async function loadData(nextPage = page, nextPageSize = pageSize, nextFilters = appliedFilters) {
    setLoading(true);
    setPageError("");
    try {
      const result = await fetchAbaSearchTerms({
        weekStart,
        compareWeekStart,
        ...nextFilters,
        asin: nextFilters.asin.trim().toUpperCase(),
        page: nextPage,
        pageSize: nextPageSize
      });
      setData(result);
      setPage(result.page);
    } finally {
      setLoading(false);
    }
  }

  function patchDraft(patch: Partial<FilterState>) {
    setDraftFilters((value) => ({ ...value, ...patch }));
  }

  function searchNow() {
    setAppliedFilters(draftFilters);
    setPage(1);
  }

  function resetFilters() {
    setDraftFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setPage(1);
  }

  async function copyCurrentPageKeywords() {
    setCopyMessage("");
    const keywords = data.rows.map((row) => row.keyword).filter(Boolean);
    if (!keywords.length) {
      setCopyMessage("当前页没有可复制的关键词");
      return;
    }
    const text = keywords.join("\n");
    try {
      await copyText(text);
      setCopyMessage(`已复制 ${keywords.length} 个关键词`);
    } catch {
      setCopyMessage("复制失败，请检查浏览器剪贴板权限");
    }
  }

  async function exportExcel() {
    if (!weekStart || exporting) return;
    setExporting(true);
    setExportMessage("");
    try {
      const result = await fetchAbaSearchTermsExport({
        weekStart,
        compareWeekStart,
        ...appliedFilters,
        asin: appliedFilters.asin.trim().toUpperCase(),
        pageSize: 10000
      });
      if (!result.rows.length) {
        setExportMessage("没有可导出的数据");
        return;
      }

      const XLSX = await import("xlsx");
      const rows = result.rows.map((row) => {
        const product1 = row.topProducts[0];
        const product2 = row.topProducts[1];
        const product3 = row.topProducts[2];
        return {
          搜索词: row.keyword,
          中文解释: row.keywordCnExplanation || "",
          搜索排名: row.currentRank ?? "",
          对比排名: row.compareRank ?? "",
          排名变化: row.rankChange ?? "",
          状态: readableChangeType(row.changeType),
          "#1 商品标题": product1?.itemName || "",
          "#1 ASIN": product1?.asin || "",
          "#1 点击份额": percentForExport(product1?.clickShare),
          "#1 转化份额": percentForExport(product1?.conversionShare),
          "#2 商品标题": product2?.itemName || "",
          "#2 ASIN": product2?.asin || "",
          "#2 点击份额": percentForExport(product2?.clickShare),
          "#2 转化份额": percentForExport(product2?.conversionShare),
          "#3 商品标题": product3?.itemName || "",
          "#3 ASIN": product3?.asin || "",
          "#3 点击份额": percentForExport(product3?.clickShare),
          "#3 转化份额": percentForExport(product3?.conversionShare)
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet["!cols"] = [
        { wch: 28 },
        { wch: 22 },
        { wch: 10 },
        { wch: 10 },
        { wch: 10 },
        { wch: 10 },
        { wch: 42 },
        { wch: 14 },
        { wch: 12 },
        { wch: 12 },
        { wch: 42 },
        { wch: 14 },
        { wch: 12 },
        { wch: 12 },
        { wch: 42 },
        { wch: 14 },
        { wch: 12 },
        { wch: 12 }
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "ABA搜索词");
      const fileName = `aba-search-terms-${result.weekStart ?? weekStart}-${rows.length}.xlsx`;
      const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });

      if ("showDirectoryPicker" in window) {
        const directoryHandle = await (window as unknown as {
          showDirectoryPicker: () => Promise<{
            getFileHandle: (name: string, options: { create: boolean }) => Promise<{
              createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
            }>;
          }>;
        }).showDirectoryPicker();
        const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        setExportMessage(`已导出 ${rows.length.toLocaleString()} 条到 ${fileName}`);
      } else {
        downloadBlob(blob, fileName);
        setExportMessage(`已下载 ${rows.length.toLocaleString()} 条`);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setExportMessage("已取消导出");
      } else {
        console.error("Export failed", error);
        setExportMessage("导出失败，请稍后重试");
      }
    } finally {
      setExporting(false);
    }
  }

  function changePageSize(value: number) {
    setPageSize(value);
    setPage(1);
  }

  function goToPage(rawValue = jumpPage) {
    const next = Number(rawValue);
    if (!Number.isInteger(next)) {
      setPageError("请输入有效页码");
      return;
    }
    if (next < 1 || next > totalPages) {
      setPageError(`页码范围是 1 到 ${totalPages.toLocaleString()}`);
      return;
    }
    setPageError("");
    setPage(next);
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
              一行一个搜索词，#1/#2/#3 是 ABA 按 clickShareRank 给出的前三个点击商品 ASIN。新词/潜力词表示本周出现、对比周未出现。
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
            <select className={inputClass} value={weekStart} onChange={(event) => { setWeekStart(event.target.value); setPage(1); }}>
              {weeks.map((week) => (
                <option key={week.id} value={week.periodStart}>
                  {week.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="对比时间">
            <select className={inputClass} value={compareWeekStart} onChange={(event) => { setCompareWeekStart(event.target.value); setPage(1); }}>
              <option value="">不对比</option>
              {weeks.map((week) => (
                <option key={week.id} value={week.periodStart}>
                  {week.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="变化类型">
            <select className={inputClass} value={draftFilters.changeType} onChange={(event) => patchDraft({ changeType: event.target.value as FilterState["changeType"] })}>
              <option value="all">全部</option>
              <option value="new">新词/潜力词</option>
              <option value="up">排名上升</option>
              <option value="down">排名下降</option>
              <option value="flat">无变化</option>
            </select>
          </Field>
          <Field label="包含关键词">
            <input className={inputClass} value={draftFilters.keyword} onChange={(event) => patchDraft({ keyword: event.target.value })} placeholder="输入需要包含的关键词" />
          </Field>
          <Field label="排除关键词">
            <input
              className={inputClass}
              value={draftFilters.excludeKeyword}
              onChange={(event) => patchDraft({ excludeKeyword: event.target.value })}
              placeholder="输入需要排除的关键词"
            />
          </Field>
          <Field label="ASIN">
            <input className={inputClass} value={draftFilters.asin} onChange={(event) => patchDraft({ asin: event.target.value })} placeholder="精确输入 ASIN" />
          </Field>
          <Field label="排序">
            <select className={inputClass} value={draftFilters.sort} onChange={(event) => patchDraft({ sort: event.target.value as FilterState["sort"] })}>
              <option value="rank">搜索排名</option>
              <option value="rankChange">排名变化</option>
              <option value="clickShare">点击份额</option>
              <option value="conversionShare">转化份额</option>
              <option value="keyword">搜索词</option>
            </select>
          </Field>
          <RangeField
            label="搜索排名"
            min={draftFilters.rankMin}
            max={draftFilters.rankMax}
            onMin={(value) => patchDraft({ rankMin: value })}
            onMax={(value) => patchDraft({ rankMax: value })}
          />
          <RangeField
            label="点击份额 %"
            min={draftFilters.clickShareMin}
            max={draftFilters.clickShareMax}
            onMin={(value) => patchDraft({ clickShareMin: value })}
            onMax={(value) => patchDraft({ clickShareMax: value })}
          />
          <RangeField
            label="转化份额 %"
            min={draftFilters.conversionShareMin}
            max={draftFilters.conversionShareMax}
            onMin={(value) => patchDraft({ conversionShareMin: value })}
            onMax={(value) => patchDraft({ conversionShareMax: value })}
          />
          <div className="flex items-end gap-2">
            <Button className="flex-1" onClick={searchNow} disabled={loading}>
              <SlidersHorizontal className="h-4 w-4" />
              筛选
            </Button>
            <button className="flex h-9 w-10 items-center justify-center rounded-md border border-border text-sm" onClick={resetFilters} title="清空筛选">
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="当前周" value={currentWeek?.label ?? data.weekStart ?? "-"} compact />
        <Metric label="对比周" value={compareWeek?.label ?? "不对比"} compact />
        <Metric label="查询结果" value={data.total.toLocaleString()} />
        <Metric label="本页新词" value={summary.newCount} />
        <Metric label="本页上升/下降" value={`${summary.upCount}/${summary.downCount}`} />
      </div>

      <Card>
        <PaginationBar
          page={page}
          pageSize={pageSize}
          total={data.total}
          totalPages={totalPages}
          loading={loading}
          jumpPage={jumpPage}
          pageError={pageError}
          onPageSize={changePageSize}
          onJumpInput={setJumpPage}
          onJump={goToPage}
          onPage={setPage}
          actions={resultActions}
        />
        <div className="overflow-auto">
          <table className="w-full min-w-[1280px] text-sm">
            <thead className="bg-slate-100 text-xs text-slate-500 dark:bg-slate-800">
              <tr>
                <th className="px-4 py-3 text-left">搜索词</th>
                <th className="px-4 py-3 text-right">搜索排名</th>
                <th className="px-4 py-3 text-right">对比排名</th>
                <th className="px-4 py-3 text-right">排名变化</th>
                <th className="px-4 py-3 text-left">状态</th>
                <th className="px-4 py-3 text-left">#1 点击商品</th>
                <th className="px-4 py-3 text-left">#2 点击商品</th>
                <th className="px-4 py-3 text-left">#3 点击商品</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <SearchTermRow key={row.keyword} row={row} />
              ))}
              {!data.rows.length && (
                <tr>
                  <td className="px-4 py-16 text-center text-slate-500" colSpan={8}>
                    {loading ? "正在加载..." : "还没有搜索词数据。请先确认后端已连接 MySQL，并且爬虫已经写入每周 ABA 表。"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationBar
          page={page}
          pageSize={pageSize}
          total={data.total}
          totalPages={totalPages}
          loading={loading}
          jumpPage={jumpPage}
          pageError={pageError}
          onPageSize={changePageSize}
          onJumpInput={setJumpPage}
          onJump={goToPage}
          onPage={setPage}
          actions={resultActions}
          compact
        />
      </Card>
    </>
  );
}

function PaginationBar({
  page,
  pageSize,
  total,
  totalPages,
  loading,
  jumpPage,
  pageError,
  actions,
  compact = false,
  onPageSize,
  onJumpInput,
  onJump,
  onPage
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  loading: boolean;
  jumpPage: string;
  pageError: string;
  actions?: ReactNode;
  compact?: boolean;
  onPageSize: (value: number) => void;
  onJumpInput: (value: string) => void;
  onJump: () => void;
  onPage: (value: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <div className="text-sm text-slate-500">
        共 <span className="font-semibold text-foreground">{total.toLocaleString()}</span> 条结果，当前第 {page} / {totalPages.toLocaleString()} 页
        {loading && <span className="ml-2 text-blue-600">加载中...</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {actions}
        <select className={inputClass} value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))} disabled={loading}>
          <option value={50}>50 条/页</option>
          <option value={100}>100 条/页</option>
          <option value={200}>200 条/页</option>
        </select>
        <button className="h-9 rounded-md border border-border px-3 disabled:opacity-50" disabled={loading || page <= 1} onClick={() => onPage(page - 1)}>
          上一页
        </button>
        <button className="h-9 rounded-md border border-border px-3 disabled:opacity-50" disabled={loading || page >= totalPages} onClick={() => onPage(page + 1)}>
          下一页
        </button>
        <div className="flex items-center gap-2">
          <input
            className={`${inputClass} w-24`}
            inputMode="numeric"
            value={jumpPage}
            onChange={(event) => onJumpInput(event.target.value.replace(/[^\d]/g, ""))}
            onKeyDown={(event) => {
              if (event.key === "Enter") onJump();
            }}
            disabled={loading}
            aria-label="跳转页码"
          />
          <button className="h-9 rounded-md border border-border px-3 disabled:opacity-50" disabled={loading} onClick={() => onJump()}>
            跳转
          </button>
        </div>
        {!compact && pageError && <span className="text-xs text-rose-600">{pageError}</span>}
      </div>
      {compact && pageError && <div className="w-full text-right text-xs text-rose-600">{pageError}</div>}
    </div>
  );
}

function ResultActions({
  loading,
  exporting,
  hasRows,
  copyMessage,
  exportMessage,
  onCopy,
  onExport
}: {
  loading: boolean;
  exporting: boolean;
  hasRows: boolean;
  copyMessage: string;
  exportMessage: string;
  onCopy: () => void;
  onExport: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-3 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-800"
        disabled={loading || !hasRows}
        onClick={onCopy}
        title="复制当前页所有关键词"
      >
        <Copy className="h-4 w-4" />
        复制关键词
      </button>
      <button
        className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-3 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-800"
        disabled={loading || exporting}
        onClick={onExport}
        title="按当前筛选条件导出前 10000 条"
      >
        <Download className="h-4 w-4" />
        {exporting ? "导出中" : "导出 Excel"}
      </button>
      {(copyMessage || exportMessage) && (
        <span className="max-w-[260px] truncate text-xs text-slate-500" title={copyMessage || exportMessage}>
          {copyMessage || exportMessage}
        </span>
      )}
    </div>
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
        <input className={inputClass} value={min} onChange={(event) => onMin(event.target.value.replace(/[^\d.]/g, ""))} placeholder="最小值" />
        <input className={inputClass} value={max} onChange={(event) => onMax(event.target.value.replace(/[^\d.]/g, ""))} placeholder="最大值" />
      </div>
    </Field>
  );
}

function Metric({ label, value, compact = false }: { label: string; value: string | number; compact?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div
        className={compact ? "mt-2 break-words text-[15px] font-semibold leading-snug" : "mt-2 truncate text-lg font-semibold"}
        title={String(value)}
      >
        {value}
      </div>
    </div>
  );
}

function SearchTermRow({ row }: { row: AbaSearchTermRow }) {
  const explanation = row.keywordCnExplanation?.trim() || "待生成中文解释";
  return (
    <tr className="border-t border-border align-top">
      <td className="max-w-[260px] px-4 py-4">
        <div className="font-semibold">{row.keyword}</div>
        <div className="mt-1 text-xs text-slate-500">{explanation}</div>
      </td>
      <td className="px-4 py-4 text-right font-medium">{formatRank(row.currentRank)}</td>
      <td className="px-4 py-4 text-right">{formatRank(row.compareRank)}</td>
      <td className={`px-4 py-4 text-right font-medium ${rankChangeClass(row.rankChange)}`}>{formatChange(row.rankChange)}</td>
      <td className="px-4 py-4">
        <Badge tone={changeTones[row.changeType]}>{changeLabels[row.changeType]}</Badge>
      </td>
      {[0, 1, 2].map((index) => (
        <td key={index} className="w-[290px] px-4 py-4">
          <ProductCell product={row.topProducts[index]} />
        </td>
      ))}
    </tr>
  );
}

function ProductCell({ product }: { product: AbaSearchTermRow["topProducts"][number] | undefined }) {
  const imageUrl = product?.imageUrl?.trim();
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  if (!product) return <span className="text-slate-400">-</span>;
  const asin = product.asin?.trim().toUpperCase();
  const showImage = Boolean(imageUrl && !imageFailed);
  return (
    <div className="space-y-1">
      <div className="line-clamp-2 text-sm" title={product.itemName || ""}>
        {product.itemName || "-"}
      </div>
      {asin && (
        <span className="group relative inline-flex">
          <a
            className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline"
            href={`https://www.amazon.com/dp/${encodeURIComponent(asin)}?psc=1`}
            target="_blank"
            rel="noreferrer"
          >
            {asin}
            <ExternalLink className="h-3 w-3" />
          </a>
          <span className="pointer-events-none absolute left-0 top-6 z-20 hidden w-44 rounded-md border border-border bg-card p-2 shadow-lg group-hover:block">
            {showImage ? (
              <img
                className="h-36 w-full rounded border border-border bg-white object-contain"
                src={imageUrl}
                alt={product.itemName || asin}
                loading="lazy"
                onError={() => setImageFailed(true)}
              />
            ) : (
              <span className="flex h-28 items-center justify-center rounded border border-dashed border-border text-xs text-slate-500">
                暂无图片
              </span>
            )}
            <span className="mt-2 block truncate text-xs font-medium text-foreground">{asin}</span>
          </span>
        </span>
      )}
      <div className="text-xs text-slate-500">
        点击：{formatPercent(product.clickShare)}　转化：{formatPercent(product.conversionShare)}
      </div>
    </div>
  );
}

function readableChangeType(value: ChangeType) {
  return changeLabels[value] ?? value;
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // LAN HTTP pages are often not treated as secure contexts; fall through to the textarea fallback.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const ok = document.execCommand("copy");
  textarea.remove();
  if (!ok) throw new Error("Copy command failed");
}

function percentForExport(value: number | null | undefined) {
  if (value === null || value === undefined) return "";
  return `${(value * 100).toFixed(2)}%`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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
