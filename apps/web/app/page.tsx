"use client";

import type { AbaSearchTermRow, AbaWeek, ChangeType, MemberUser } from "@aba/shared";
import {
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  Flame,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Target,
  Trash2,
  X,
  TrendingUp
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, Field, inputClass } from "../components/ui";
import { fetchAbaSearchTermsExport, fetchAbaSearchTermsResult, fetchAbaWeeks, fetchCurrentMember, logKeywordCopy } from "../lib/api";

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

type PageItem = number | "ellipsis";
const NEW_WEEK_NOTICE_STORAGE_KEY = "deepwhale-dismissed-new-week-notice";
const SAVED_FILTER_MODELS_STORAGE_KEY = "deepwhale-saved-filter-models";
const OPPORTUNITY_LIST_STORAGE_KEY = "deepwhale-opportunity-list";
const MAX_SAVED_FILTER_MODELS = 12;
const MAX_OPPORTUNITIES = 200;
const AUTH_CHANGED_EVENT = "deepwhale:auth-changed";
const OPEN_AUTH_EVENT = "deepwhale:open-auth";

type SavedFilterModel = {
  id: string;
  name: string;
  filters: FilterState;
  updatedAt: string;
};

type OpportunityItem = {
  keyword: string;
  keywordCnExplanation: string;
  departmentName: string;
  currentRank: number | null;
  compareRank: number | null;
  rankChange: number | null;
  changeType: ChangeType;
  weekStart: string;
  weekLabel: string;
  topAsins: string[];
  addedAt: string;
};

type MarketPreset = {
  key: string;
  label: string;
  description: string;
  icon: typeof Flame;
  patch: Partial<FilterState>;
};

const marketPresets: MarketPreset[] = [
  {
    key: "hot",
    label: "热门市场",
    description: "前 5 万名",
    icon: Flame,
    patch: { rankMin: "", rankMax: "50000", changeType: "all", sort: "rank" }
  },
  {
    key: "new",
    label: "新词挖掘",
    description: "本周首次出现",
    icon: Sparkles,
    patch: { rankMin: "", rankMax: "", changeType: "new", sort: "rank" }
  },
  {
    key: "rising",
    label: "快速上升",
    description: "按上升幅度",
    icon: TrendingUp,
    patch: { rankMin: "", rankMax: "", changeType: "up", sort: "rankChange" }
  },
  {
    key: "mid",
    label: "中腰部市场",
    description: "5 万到 20 万名",
    icon: Target,
    patch: { rankMin: "50000", rankMax: "200000", changeType: "all", sort: "rank" }
  },
  {
    key: "longtail",
    label: "长尾市场",
    description: "20 万名以后",
    icon: Search,
    patch: { rankMin: "200000", rankMax: "", changeType: "all", sort: "rank" }
  }
];

export default function AbaSearchTermsPage() {
  return (
    <Suspense fallback={null}>
      <AbaSearchTermsContent />
    </Suspense>
  );
}

function AbaSearchTermsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCompareSpecified = useRef(searchParams.has("compareWeekStart"));
  const loadRequestId = useRef(0);
  const [weeks, setWeeks] = useState<AbaWeek[]>([]);
  const [weekStart, setWeekStart] = useState(() => searchParams.get("weekStart") ?? "");
  const [compareWeekStart, setCompareWeekStart] = useState(() => searchParams.get("compareWeekStart") ?? "");
  const [draftFilters, setDraftFilters] = useState<FilterState>(() => filtersFromParams(searchParams));
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(() => filtersFromParams(searchParams));
  const [page, setPage] = useState(() => positiveInteger(searchParams.get("page"), 1));
  const [pageSize, setPageSize] = useState(() => pageSizeFromParams(searchParams.get("pageSize")));
  const [jumpPage, setJumpPage] = useState(() => String(positiveInteger(searchParams.get("page"), 1)));
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
  const [member, setMember] = useState<MemberUser | null>(null);
  const [memberResolved, setMemberResolved] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(() => hasAdvancedFilters(filtersFromParams(searchParams)));
  const [dismissedNewWeekNotice, setDismissedNewWeekNotice] = useState<{ weekStart: string; date: string } | null>(null);
  const [savedFilterModels, setSavedFilterModels] = useState<SavedFilterModel[]>([]);
  const [selectedFilterModelId, setSelectedFilterModelId] = useState("");
  const [saveModelOpen, setSaveModelOpen] = useState(false);
  const [saveModelName, setSaveModelName] = useState("");
  const [filterModelMessage, setFilterModelMessage] = useState("");
  const [opportunityItems, setOpportunityItems] = useState<OpportunityItem[]>([]);
  const [opportunityDrawerOpen, setOpportunityDrawerOpen] = useState(false);
  const [opportunityMessage, setOpportunityMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function refreshAccess() {
      const currentMember = await fetchCurrentMember();
      if (!active) return;
      setMember(currentMember);
      setMemberResolved(true);

      if (!currentMember) {
        setWeeks([]);
        setData((value) => ({ ...value, rows: [], total: 0 }));
        setPageError("");
        return;
      }

      const items = await fetchAbaWeeks();
      if (!active) return;
      setWeeks(items);
      setWeekStart((value) => value || items[0]?.periodStart || "");
      setCompareWeekStart((value) => value || (initialCompareSpecified.current ? "" : items[1]?.periodStart || ""));
    }

    void refreshAccess();
    window.addEventListener(AUTH_CHANGED_EVENT, refreshAccess);
    return () => {
      active = false;
      window.removeEventListener(AUTH_CHANGED_EVENT, refreshAccess);
    };
  }, []);

  useEffect(() => {
    setDismissedNewWeekNotice(readDismissedNewWeekNotice());
    setSavedFilterModels(readSavedFilterModels());
    setOpportunityItems(readOpportunityItems());
  }, []);

  useEffect(() => {
    if (!member || !weekStart) return;
    if (compareWeekStart && compareWeekStart >= weekStart) {
      setCompareWeekStart(defaultCompareWeekStart(weeks, weekStart));
      setPage(1);
      setPageError("对比周必须早于报告周。");
      return;
    }
    void loadData(page, pageSize, appliedFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, compareWeekStart, page, pageSize, appliedFilters, member]);

  useEffect(() => {
    setJumpPage(String(page));
  }, [page]);

  const currentWeek = weeks.find((week) => week.periodStart === weekStart);
  const validCompareWeeks = weeks.filter((week) => !weekStart || week.periodStart < weekStart);
  const compareWeek = validCompareWeeks.find((week) => week.periodStart === compareWeekStart);
  const latestWeek = weeks[0] ?? null;
  const latestCompareWeek = weeks[1] ?? null;
  const todayKey = todayLocalDateKey();
  const newerWeekNotice =
    latestWeek &&
    weekStart &&
    weekStart < latestWeek.periodStart &&
    !(dismissedNewWeekNotice?.weekStart === latestWeek.periodStart && dismissedNewWeekNotice.date === todayKey)
      ? latestWeek
      : null;
  const totalPages = Math.max(1, Math.ceil(data.total / pageSize));
  const summary = useMemo(() => summarizeRows(data.rows), [data.rows]);
  const accessNotice = useMemo(() => planAccessNotice(member), [member]);
  const searchUrl = useMemo(
    () => buildSearchUrl({ weekStart, compareWeekStart, filters: appliedFilters, page, pageSize }),
    [weekStart, compareWeekStart, appliedFilters, page, pageSize]
  );
  const activeFilterChips = useMemo(() => activeFilterChipsFor(appliedFilters), [appliedFilters]);
  const activePresetKey = useMemo(() => matchingPresetKey(draftFilters), [draftFilters]);
  const advancedFilterCount = useMemo(() => countAdvancedFilters(draftFilters), [draftFilters]);
  const opportunityKeywords = useMemo(
    () => new Set(opportunityItems.map((item) => opportunityKey(item.keyword))),
    [opportunityItems]
  );

  useEffect(() => {
    if (!weekStart) return;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (currentUrl !== searchUrl) {
      router.replace(searchUrl, { scroll: false });
    }
    window.localStorage.setItem("deepwhale-last-search-url", searchUrl);
  }, [router, searchUrl, weekStart]);

  async function loadData(nextPage = page, nextPageSize = pageSize, nextFilters = appliedFilters) {
    const requestId = ++loadRequestId.current;
    setLoading(true);
    setPageError("");
    try {
      const result = await fetchAbaSearchTermsResult({
        weekStart,
        compareWeekStart,
        ...nextFilters,
        asin: nextFilters.asin.trim().toUpperCase(),
        page: nextPage,
        pageSize: nextPageSize
      });
      if (requestId !== loadRequestId.current) return;
      if (!result.data) {
        setData({
          rows: [],
          total: 0,
          weekStart: currentWeek?.periodStart ?? weekStart,
          weekEnd: currentWeek?.periodEnd ?? null,
          compareWeekStart: compareWeek?.periodStart ?? (compareWeekStart || null)
        });
        setPage(nextPage);
        setPageError(result.status >= 500 ? "查询失败，请缩小筛选条件或稍后重试。" : result.error || "查询失败，请稍后重试。");
        return;
      }
      setData(result.data);
      setPage(result.data.page);
    } finally {
      if (requestId === loadRequestId.current) {
        setLoading(false);
      }
    }
  }

  function patchDraft(patch: Partial<FilterState>) {
    setDraftFilters((value) => ({ ...value, ...patch }));
  }

  function changeReportWeek(nextWeekStart: string) {
    setWeekStart(nextWeekStart);
    setCompareWeekStart(defaultCompareWeekStart(weeks, nextWeekStart));
    setPage(1);
    setPageError("");
  }

  function changeCompareWeek(nextCompareWeekStart: string) {
    if (nextCompareWeekStart && nextCompareWeekStart >= weekStart) {
      setCompareWeekStart(defaultCompareWeekStart(weeks, weekStart));
      setPage(1);
      setPageError("对比周必须早于报告周。");
      return;
    }
    setCompareWeekStart(nextCompareWeekStart);
    setPage(1);
    setPageError("");
  }

  function searchNow() {
    if (!member) {
      window.dispatchEvent(new CustomEvent(OPEN_AUTH_EVENT, { detail: { mode: "login" } }));
      return;
    }
    if (needsRankChangeScope(draftFilters)) {
      setPageError("请先选择变化类型或输入关键词后再按排名变化排序。");
      return;
    }
    setAppliedFilters(draftFilters);
    setPage(1);
  }

  function applyMarketPreset(preset: MarketPreset) {
    if (!member) {
      window.dispatchEvent(new CustomEvent(OPEN_AUTH_EVENT, { detail: { mode: "login" } }));
      return;
    }

    const nextFilters: FilterState = {
      ...draftFilters,
      rankMin: "",
      rankMax: "",
      clickShareMin: "",
      clickShareMax: "",
      conversionShareMin: "",
      conversionShareMax: "",
      changeType: "all",
      sort: "rank",
      ...preset.patch
    };
    setDraftFilters(nextFilters);
    setAppliedFilters(nextFilters);
    setPage(1);
    setPageError("");
    setSelectedFilterModelId("");
    setFilterModelMessage(`已应用场景：${preset.label}`);
  }

  function resetFilters() {
    setDraftFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setPage(1);
    setSelectedFilterModelId("");
    setFilterModelMessage("");
  }

  function applySavedFilterModel(modelId: string) {
    setSelectedFilterModelId(modelId);
    if (!modelId) return;

    const model = savedFilterModels.find((item) => item.id === modelId);
    if (!model) return;
    setDraftFilters(model.filters);
    setAppliedFilters(model.filters);
    setAdvancedOpen(hasAdvancedFilters(model.filters));
    setPage(1);
    setPageError("");
    setFilterModelMessage(`已应用方案：${model.name}`);
  }

  function openSaveFilterModel() {
    const selectedModel = savedFilterModels.find((item) => item.id === selectedFilterModelId);
    setSaveModelName(selectedModel?.name ?? "");
    setFilterModelMessage("");
    setSaveModelOpen(true);
  }

  function saveCurrentFilterModel() {
    const name = saveModelName.trim();
    if (!name) {
      setFilterModelMessage("请输入方案名称。");
      return;
    }

    const existingByName = savedFilterModels.find((item) => item.name.toLowerCase() === name.toLowerCase());
    if (!existingByName && savedFilterModels.length >= MAX_SAVED_FILTER_MODELS) {
      setFilterModelMessage(`最多保存 ${MAX_SAVED_FILTER_MODELS} 个筛选方案。`);
      return;
    }

    const nextModel: SavedFilterModel = {
      id: existingByName?.id ?? createSavedFilterModelId(),
      name: name.slice(0, 30),
      filters: { ...draftFilters },
      updatedAt: new Date().toISOString()
    };
    const nextModels = [
      nextModel,
      ...savedFilterModels.filter((item) => item.id !== nextModel.id)
    ].slice(0, MAX_SAVED_FILTER_MODELS);
    persistSavedFilterModels(nextModels);
    setSavedFilterModels(nextModels);
    setSelectedFilterModelId(nextModel.id);
    setSaveModelOpen(false);
    setFilterModelMessage(existingByName ? `已更新方案：${nextModel.name}` : `已保存方案：${nextModel.name}`);
  }

  function deleteSelectedFilterModel() {
    if (!selectedFilterModelId) return;
    const selectedModel = savedFilterModels.find((item) => item.id === selectedFilterModelId);
    const nextModels = savedFilterModels.filter((item) => item.id !== selectedFilterModelId);
    persistSavedFilterModels(nextModels);
    setSavedFilterModels(nextModels);
    setSelectedFilterModelId("");
    setFilterModelMessage(selectedModel ? `已删除方案：${selectedModel.name}` : "");
  }

  function switchToLatestWeek() {
    if (!latestWeek) return;
    setWeekStart(latestWeek.periodStart);
    setCompareWeekStart(latestCompareWeek?.periodStart ?? "");
    setPage(1);
    setPageError("");
  }

  function dismissNewWeekNoticeForToday() {
    if (!latestWeek) return;
    const next = { weekStart: latestWeek.periodStart, date: todayLocalDateKey() };
    setDismissedNewWeekNotice(next);
    window.localStorage.setItem(NEW_WEEK_NOTICE_STORAGE_KEY, JSON.stringify(next));
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
      await logKeywordCopy({ weekStart, compareWeekStart, page, pageSize, count: keywords.length });
      setCopyMessage(`已复制 ${keywords.length} 个关键词`);
    } catch {
      setCopyMessage("复制失败，请检查浏览器剪贴板权限");
    }
  }

  async function copySingleKeyword(keyword: string) {
    setCopyMessage("");
    try {
      await copyText(keyword);
      await logKeywordCopy({ weekStart, compareWeekStart, page, pageSize, count: 1, keyword });
      setCopyMessage(`已复制：${keyword}`);
    } catch {
      setCopyMessage("复制失败，请检查浏览器剪贴板权限");
    }
  }

  function toggleOpportunity(row: AbaSearchTermRow) {
    const key = opportunityKey(row.keyword);
    const existing = opportunityItems.some((item) => opportunityKey(item.keyword) === key);

    if (existing) {
      const nextItems = opportunityItems.filter((item) => opportunityKey(item.keyword) !== key);
      persistOpportunityItems(nextItems);
      setOpportunityItems(nextItems);
      setOpportunityMessage(`已从机会清单移除：${row.keyword}`);
      return;
    }

    if (opportunityItems.length >= MAX_OPPORTUNITIES) {
      setOpportunityMessage(`机会清单最多保存 ${MAX_OPPORTUNITIES} 个关键词`);
      setOpportunityDrawerOpen(true);
      return;
    }

    const nextItem: OpportunityItem = {
      keyword: row.keyword,
      keywordCnExplanation: row.keywordCnExplanation?.trim() ?? "",
      departmentName: usefulDepartmentName(row.departmentName),
      currentRank: row.currentRank,
      compareRank: row.compareRank,
      rankChange: row.rankChange,
      changeType: row.changeType,
      weekStart,
      weekLabel: currentWeek?.label ?? weekStart,
      topAsins: row.topProducts.map((product) => product.asin?.trim().toUpperCase()).filter((asin): asin is string => Boolean(asin)),
      addedAt: new Date().toISOString()
    };
    const nextItems = [nextItem, ...opportunityItems];
    persistOpportunityItems(nextItems);
    setOpportunityItems(nextItems);
    setOpportunityMessage(`已加入机会清单：${row.keyword}`);
  }

  function removeOpportunity(keyword: string) {
    const key = opportunityKey(keyword);
    const nextItems = opportunityItems.filter((item) => opportunityKey(item.keyword) !== key);
    persistOpportunityItems(nextItems);
    setOpportunityItems(nextItems);
    setOpportunityMessage(`已移除：${keyword}`);
  }

  function clearOpportunities() {
    persistOpportunityItems([]);
    setOpportunityItems([]);
    setOpportunityMessage("机会清单已清空");
  }

  async function copyOpportunityKeywords() {
    if (!opportunityItems.length) return;
    try {
      await copyText(opportunityItems.map((item) => item.keyword).join("\n"));
      setOpportunityMessage(`已复制 ${opportunityItems.length} 个机会关键词`);
    } catch {
      setOpportunityMessage("复制失败，请检查浏览器剪贴板权限");
    }
  }

  async function exportOpportunities() {
    if (!opportunityItems.length) return;
    try {
      const XLSX = await import("xlsx");
      const rows = opportunityItems.map((item) => ({
        搜索词: item.keyword,
        中文解释: item.keywordCnExplanation,
        分类: item.departmentName,
        当前排名: item.currentRank ?? "",
        对比排名: item.compareRank ?? "",
        排名变化: item.rankChange ?? "",
        状态: readableChangeType(item.changeType),
        报告周: item.weekLabel,
        "TOP ASIN": item.topAsins.join(" / "),
        收藏时间: new Date(item.addedAt).toLocaleString("zh-CN")
      }));
      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet["!cols"] = [
        { wch: 30 },
        { wch: 24 },
        { wch: 18 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
        { wch: 10 },
        { wch: 24 },
        { wch: 38 },
        { wch: 22 }
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "机会清单");
      const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
      downloadBlob(
        new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        `deepwhale-opportunities-${todayLocalDateKey()}.xlsx`
      );
      setOpportunityMessage(`已导出 ${opportunityItems.length} 个机会关键词`);
    } catch (error) {
      console.error("Opportunity export failed", error);
      setOpportunityMessage("导出失败，请稍后重试");
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
    const firstRowIndex = (page - 1) * pageSize + 1;
    const nextPage = Math.max(1, Math.ceil(firstRowIndex / value));
    setPageSize(value);
    setPage(nextPage);
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
      <section className="mb-4 flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">市场挖掘</h1>
            <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-700 ring-1 ring-sky-100 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-900">US ABA Weekly</span>
          </div>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">从每周搜索排名、变化幅度和前三点击商品中筛选值得验证的市场机会。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
            美国站
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            {currentWeek?.label ? `当前报告：${currentWeek.label}` : "每周更新"}
          </span>
        </div>
      </section>

      {newerWeekNotice ? (
        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="font-semibold">发现新周报 {newerWeekNotice.label}</span>
            <span className="ml-2 text-amber-700 dark:text-amber-200/80">当前页面仍停留在旧周报，可一键切换。</span>
          </div>
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center rounded-md border border-amber-200 bg-white px-4 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-300 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-100 dark:hover:bg-amber-900/60"
            onClick={dismissNewWeekNoticeForToday}
          >
            今日不再提示
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center rounded-md bg-orange-500 px-4 text-sm font-semibold text-white transition hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-300 dark:bg-orange-500 dark:hover:bg-orange-400"
            onClick={switchToLatestWeek}
          >
            切换到新周报
          </button>
        </div>
      ) : null}

      <section className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-4 py-4 dark:border-slate-800">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-950 dark:text-white">选品场景</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">一键套用常用排名与变化条件，再叠加关键词继续收窄。</p>
            </div>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <select
                className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:focus:ring-sky-950 sm:w-44 sm:flex-none"
                value={selectedFilterModelId}
                onChange={(event) => applySavedFilterModel(event.target.value)}
                aria-label="我的筛选方案"
              >
                <option value="">我的筛选方案</option>
                {savedFilterModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-sky-200 hover:text-sky-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-sky-300"
                onClick={openSaveFilterModel}
                aria-label="保存当前筛选方案"
                title="保存当前筛选方案"
              >
                <Save className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-rose-200 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-35 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                onClick={deleteSelectedFilterModel}
                disabled={!selectedFilterModelId}
                aria-label="删除当前筛选方案"
                title="删除当前筛选方案"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            {marketPresets.map((preset) => {
              const Icon = preset.icon;
              const active = activePresetKey === preset.key;
              return (
                <button
                  key={preset.key}
                  type="button"
                  className={`flex min-h-[62px] items-center gap-3 rounded-lg border px-3 text-left transition ${
                    active
                      ? "border-sky-300 bg-sky-50 text-sky-800 shadow-sm dark:border-sky-700 dark:bg-sky-950/60 dark:text-sky-100"
                      : "border-slate-200 bg-white text-slate-700 hover:border-sky-200 hover:bg-sky-50/60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-sky-800 dark:hover:bg-sky-950/30"
                  }`}
                  onClick={() => applyMarketPreset(preset)}
                  disabled={loading}
                >
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ${active ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold">{preset.label}</span>
                    <span className="mt-0.5 block truncate text-[11px] opacity-70">{preset.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-4 py-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(260px,1.35fr)_minmax(220px,.85fr)_minmax(220px,.85fr)_auto]">
            <Field label="搜索词">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className={`${inputClass} pl-9`}
                  value={draftFilters.keyword}
                  onChange={(event) => patchDraft({ keyword: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") searchNow();
                  }}
                  placeholder="输入关键词，如 display、wood、pet supplies"
                />
              </div>
            </Field>
            <Field label="报告时间">
              <select className={inputClass} value={weekStart} onChange={(event) => changeReportWeek(event.target.value)}>
                {weeks.length ? null : <option value="">{member ? "正在读取周报..." : "登录后选择周报"}</option>}
                {weeks.map((week) => (
                  <option key={week.id} value={week.periodStart}>
                    {week.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="对比时间">
              <select className={inputClass} value={compareWeekStart} onChange={(event) => changeCompareWeek(event.target.value)}>
                <option value="">不对比</option>
                {validCompareWeeks.map((week) => (
                  <option key={week.id} value={week.periodStart}>
                    {week.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex items-end">
              <Button className="w-full px-6 lg:w-auto" onClick={searchNow} disabled={loading}>
                {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {loading ? "正在查询" : "开始分析"}
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-3 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {activeFilterChips.length ? (
                activeFilterChips.map((chip) => (
                  <span key={chip} className="max-w-full truncate rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {chip}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-400">当前未设置额外筛选</span>
              )}
              {filterModelMessage ? <span className="text-xs font-medium text-sky-700 dark:text-sky-300">{filterModelMessage}</span> : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:border-sky-200 hover:text-sky-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-sky-300"
                onClick={() => setAdvancedOpen((value) => !value)}
                aria-expanded={advancedOpen}
              >
                高级筛选
                {advancedFilterCount > 0 ? <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] text-sky-700 dark:bg-sky-950 dark:text-sky-200">{advancedFilterCount}</span> : null}
                <ChevronDown className={`h-4 w-4 transition ${advancedOpen ? "rotate-180" : ""}`} />
              </button>
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-rose-200 hover:text-rose-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                onClick={resetFilters}
                title="清空筛选"
                aria-label="清空筛选"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>
          </div>

          {advancedOpen ? (
            <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-2 xl:grid-cols-4 dark:border-slate-800">
              <Field label="变化类型">
                <select className={inputClass} value={draftFilters.changeType} onChange={(event) => patchDraft({ changeType: event.target.value as FilterState["changeType"] })}>
                  <option value="all">全部</option>
                  <option value="new">新词/潜力词</option>
                  <option value="up">排名上升</option>
                  <option value="down">排名下降</option>
                  <option value="flat">无变化</option>
                </select>
              </Field>
              <Field label="排除关键词">
                <input
                  className={inputClass}
                  value={draftFilters.excludeKeyword}
                  onChange={(event) => patchDraft({ excludeKeyword: event.target.value })}
                  placeholder="多个词用 & 分隔，如 toy & shoes"
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
              <div className="flex items-end">
                <Button className="w-full" onClick={searchNow} disabled={loading}>
                  应用筛选
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {member ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="当前周" value={currentWeek?.label ?? data.weekStart ?? "-"} compact />
          <Metric label="对比周" value={compareWeek?.label ?? "不对比"} compact />
          <Metric label="查询结果" value={loading && data.total === 0 ? "..." : data.total.toLocaleString()} />
          <Metric label="本页新词" value={loading && !data.rows.length ? "..." : summary.newCount} />
          <Metric label="本页上升/下降" value={loading && !data.rows.length ? "..." : `${summary.upCount}/${summary.downCount}`} />
        </div>
      ) : null}


      {accessNotice ? (
        <div className="mb-4 rounded-lg border border-sky-100 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-700 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-200">
          {accessNotice}
        </div>
      ) : null}
      <Card className="relative overflow-hidden">
        {!memberResolved || !member ? (
          <AuthGate
            loading={!memberResolved}
            onLogin={() => window.dispatchEvent(new CustomEvent(OPEN_AUTH_EVENT, { detail: { mode: "login" } }))}
          />
        ) : (
          <>
            {loading ? (
              <div className="absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden bg-sky-100 dark:bg-sky-950">
                <div className="h-full w-1/3 animate-pulse bg-sky-500" />
              </div>
            ) : null}
            <ResultToolbar
              page={page}
              total={data.total}
              totalPages={totalPages}
              loading={loading}
              exporting={exporting}
              hasRows={data.rows.length > 0}
              copyMessage={copyMessage}
              exportMessage={exportMessage}
              opportunityCount={opportunityItems.length}
              opportunityMessage={opportunityMessage}
              onCopy={copyCurrentPageKeywords}
              onExport={exportExcel}
              onOpenOpportunities={() => setOpportunityDrawerOpen(true)}
            />
            <div className={`overflow-x-auto transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
              <table className="w-full min-w-[1360px] table-fixed text-sm">
                <colgroup>
                  <col className="w-[230px]" />
                  <col className="w-[88px]" />
                  <col className="w-[88px]" />
                  <col className="w-[96px]" />
                  <col className="w-[84px]" />
                  <col className="w-[258px]" />
                  <col className="w-[258px]" />
                  <col className="w-[258px]" />
                </colgroup>
                <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500 shadow-[inset_0_-1px_0_hsl(var(--border))] dark:bg-slate-800 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3 text-left">搜索词</th>
                    <th className="whitespace-nowrap px-4 py-3 text-right">搜索排名</th>
                    <th className="whitespace-nowrap px-4 py-3 text-right">对比排名</th>
                    <th className="whitespace-nowrap px-4 py-3 text-right">排名变化</th>
                    <th className="whitespace-nowrap px-4 py-3 text-left">状态</th>
                    <th className="px-4 py-3 text-left">#1 点击商品</th>
                    <th className="px-4 py-3 text-left">#2 点击商品</th>
                    <th className="px-4 py-3 text-left">#3 点击商品</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <SearchTermRow
                      key={row.keyword}
                      row={row}
                      isOpportunity={opportunityKeywords.has(opportunityKey(row.keyword))}
                      onCopyKeyword={copySingleKeyword}
                      onToggleOpportunity={toggleOpportunity}
                    />
                  ))}
                  {!data.rows.length && (
                    <tr>
                      <td className="px-4 py-16 text-center text-slate-500 dark:text-slate-400" colSpan={8}>
                        {loading ? "正在加载..." : pageError || "没有符合当前条件的数据，请调整关键词或筛选范围。"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={page}
              pageSize={pageSize}
              totalPages={totalPages}
              loading={loading}
              jumpPage={jumpPage}
              pageError={pageError}
              onPageSize={changePageSize}
              onJumpInput={setJumpPage}
              onJump={goToPage}
              onPage={setPage}
            />
          </>
        )}
      </Card>

      {saveModelOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <section className="relative w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900" role="dialog" aria-modal="true" aria-labelledby="save-filter-model-title">
            <button
              type="button"
              className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
              onClick={() => setSaveModelOpen(false)}
              aria-label="关闭"
              title="关闭"
            >
              <X className="h-4 w-4" />
            </button>
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-200">
              <Save className="h-5 w-5" />
            </span>
            <h2 id="save-filter-model-title" className="mt-4 text-xl font-black text-slate-950 dark:text-white">保存筛选方案</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">保存关键词、排除词、排名区间、变化类型和排序。报告周与页码不会保存。</p>
            <label className="mt-5 block text-sm font-semibold text-slate-700 dark:text-slate-200" htmlFor="filter-model-name">
              方案名称
            </label>
            <input
              id="filter-model-name"
              className={`${inputClass} mt-2`}
              value={saveModelName}
              onChange={(event) => setSaveModelName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") saveCurrentFilterModel();
              }}
              maxLength={30}
              autoFocus
              placeholder="例如：5-10 万名家居机会"
            />
            {filterModelMessage ? <div className="mt-3 text-sm font-medium text-rose-600 dark:text-rose-300">{filterModelMessage}</div> : null}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                onClick={() => setSaveModelOpen(false)}
              >
                取消
              </button>
              <Button className="h-10" onClick={saveCurrentFilterModel}>
                保存方案
              </Button>
            </div>
          </section>
        </div>
      ) : null}

      {opportunityDrawerOpen ? (
        <OpportunityDrawer
          items={opportunityItems}
          message={opportunityMessage}
          onClose={() => setOpportunityDrawerOpen(false)}
          onCopy={() => void copyOpportunityKeywords()}
          onExport={() => void exportOpportunities()}
          onRemove={removeOpportunity}
          onClear={clearOpportunities}
        />
      ) : null}
    </>
  );
}

function AuthGate({ loading, onLogin }: { loading: boolean; onLogin: () => void }) {
  if (loading) {
    return (
      <div className="flex min-h-[280px] items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        正在确认会员状态...
      </div>
    );
  }

  return (
    <section className="grid min-h-[300px] place-items-center bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_100%)] px-6 py-12 text-center dark:bg-none dark:bg-slate-900">
      <div className="max-w-xl">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-sky-600 text-white shadow-sm">
          <LockKeyhole className="h-5 w-5" />
        </span>
        <h2 className="mt-5 text-xl font-black text-slate-950 dark:text-white">登录后查看真实 ABA 周报数据</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500 dark:text-slate-400">
          登录后可按套餐查看搜索排名、周变化、前三点击商品，并使用复制、Amazon 跳转和 Excel 导出。
        </p>
        <Button className="mt-6 px-7" onClick={onLogin}>
          登录 / 注册
        </Button>
      </div>
    </section>
  );
}

function OpportunityDrawer({
  items,
  message,
  onClose,
  onCopy,
  onExport,
  onRemove,
  onClear
}: {
  items: OpportunityItem[];
  message: string;
  onClose: () => void;
  onCopy: () => void;
  onExport: () => void;
  onRemove: (keyword: string) => void;
  onClear: () => void;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70]">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-slate-950/35 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="关闭机会清单"
      />
      <aside
        className="absolute inset-y-0 right-0 flex w-full max-w-[460px] flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950"
        role="dialog"
        aria-modal="true"
        aria-labelledby="opportunity-drawer-title"
      >
        <header className="border-b border-slate-200 px-5 py-5 dark:border-slate-800">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-200">
                  <ListChecks className="h-4 w-4" />
                </span>
                <div>
                  <h2 id="opportunity-drawer-title" className="text-lg font-black text-slate-950 dark:text-white">
                    机会清单
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    已保存 {items.length} / {MAX_OPPORTUNITIES}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
                集中复查值得进一步验证的关键词，再复制到 Amazon 或导出给团队。
              </p>
            </div>
            <button
              type="button"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-900 dark:hover:text-white"
              onClick={onClose}
              aria-label="关闭"
              title="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-sky-600 px-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={onCopy}
              disabled={!items.length}
            >
              <Copy className="h-4 w-4" />
              复制全部
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:border-sky-200 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:text-sky-300"
              onClick={onExport}
              disabled={!items.length}
            >
              <Download className="h-4 w-4" />
              导出 Excel
            </button>
            <button
              type="button"
              className="ml-auto inline-flex h-9 items-center gap-2 rounded-md px-2 text-sm font-medium text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
              onClick={onClear}
              disabled={!items.length}
            >
              <Trash2 className="h-4 w-4" />
              清空
            </button>
          </div>
          {message ? <p className="mt-3 truncate text-xs font-medium text-sky-700 dark:text-sky-300" title={message}>{message}</p> : null}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {items.length ? (
            <ul className="divide-y divide-slate-100 dark:divide-slate-900">
              {items.map((item) => (
                <li key={opportunityKey(item.keyword)} className="group px-5 py-4 transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300">
                      <BookmarkCheck className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <a
                        href={amazonSearchHref(item.keyword)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex max-w-full items-center gap-1 font-bold text-slate-950 transition hover:text-sky-700 hover:underline dark:text-white dark:hover:text-sky-300"
                        title={`在 Amazon 搜索：${item.keyword}`}
                      >
                        <span className="truncate">{item.keyword}</span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      </a>
                      {item.keywordCnExplanation ? (
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                          {item.keywordCnExplanation}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-900">排名 {formatRank(item.currentRank)}</span>
                        <span className={`rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-900 ${rankChangeClass(item.rankChange)}`}>
                          {formatChange(item.rankChange)}
                        </span>
                        <Badge tone={changeTones[item.changeType]}>{changeLabels[item.changeType]}</Badge>
                      </div>
                      <div className="mt-2 flex min-w-0 items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
                        <span className="truncate">{item.weekLabel}</span>
                        {item.departmentName ? <span className="truncate">· {item.departmentName}</span> : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-300 opacity-70 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 dark:text-slate-700 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
                      onClick={() => onRemove(item.keyword)}
                      aria-label={`移除：${item.keyword}`}
                      title="从机会清单移除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="grid h-full min-h-[360px] place-items-center px-8 text-center">
              <div className="max-w-xs">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-900 dark:text-slate-500">
                  <Bookmark className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-bold text-slate-900 dark:text-white">还没有保存机会</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  点击关键词右侧的书签图标，把值得验证的市场放到这里。
                </p>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function ResultToolbar({
  page,
  total,
  totalPages,
  loading,
  exporting,
  hasRows,
  copyMessage,
  exportMessage,
  opportunityCount,
  opportunityMessage,
  onCopy,
  onExport,
  onOpenOpportunities
}: {
  page: number;
  total: number;
  totalPages: number;
  loading: boolean;
  exporting: boolean;
  hasRows: boolean;
  copyMessage: string;
  exportMessage: string;
  opportunityCount: number;
  opportunityMessage: string;
  onCopy: () => void;
  onExport: () => void;
  onOpenOpportunities: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-white px-4 py-3 dark:bg-slate-900">
      <div>
        <div className="text-sm text-slate-600 dark:text-slate-300">
          共 <span className="font-bold text-slate-950 dark:text-white">{total.toLocaleString()}</span> 条结果
          <span className="mx-2 text-slate-300">/</span>
          第 <span className="font-semibold text-slate-950 dark:text-white">{page}</span> / {totalPages.toLocaleString()} 页
          {loading && <span className="ml-2 text-blue-600 dark:text-sky-300">加载中...</span>}
        </div>
        <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">点击关键词可直达 Amazon，复制按钮只复制当前关键词。</div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="inline-flex h-9 items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 text-sm font-semibold text-sky-700 transition hover:border-sky-300 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-200 dark:hover:border-sky-700"
          onClick={onOpenOpportunities}
          title="查看已收藏的市场机会"
        >
          <ListChecks className="h-4 w-4" />
          机会清单
          <span className="grid min-w-5 place-items-center rounded bg-white px-1.5 py-0.5 text-[11px] font-bold text-sky-700 shadow-sm dark:bg-slate-900 dark:text-sky-200">
            {opportunityCount}
          </span>
        </button>
        <button
          className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-card px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-800"
          disabled={loading || !hasRows}
          onClick={onCopy}
          title="复制当前页所有关键词"
        >
          <Copy className="h-4 w-4" />
          复制关键词
        </button>
        <button
          className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-card px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-800"
          disabled={loading || exporting}
          onClick={onExport}
          title="按当前筛选条件导出前 10000 条"
        >
          <Download className="h-4 w-4" />
          {exporting ? "导出中" : "导出 Excel"}
        </button>
        {(opportunityMessage || copyMessage || exportMessage) && (
          <span className="max-w-[280px] truncate text-xs text-slate-500 dark:text-slate-400" title={opportunityMessage || copyMessage || exportMessage}>
            {opportunityMessage || copyMessage || exportMessage}
          </span>
        )}
      </div>
    </div>
  );
}

function PaginationBar({
  page,
  pageSize,
  totalPages,
  loading,
  jumpPage,
  pageError,
  onPageSize,
  onJumpInput,
  onJump,
  onPage
}: {
  page: number;
  pageSize: number;
  totalPages: number;
  loading: boolean;
  jumpPage: string;
  pageError: string;
  onPageSize: (value: number) => void;
  onJumpInput: (value: string) => void;
  onJump: () => void;
  onPage: (value: number) => void;
}) {
  const items = paginationItems(page, totalPages);
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3 text-sm">
      <button
        className="grid h-9 min-w-9 place-items-center rounded-md border border-border bg-card px-3 text-slate-500 transition hover:border-orange-200 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:border-orange-800 dark:hover:text-orange-300"
        disabled={loading || page <= 1}
        onClick={() => onPage(page - 1)}
      >
        上一页
      </button>
      <div className="flex items-center gap-1">
        {items.map((item, index) =>
          item === "ellipsis" ? (
            <span key={`ellipsis-${index}`} className="grid h-9 min-w-9 place-items-center text-slate-400 dark:text-slate-500">
              ...
            </span>
          ) : (
            <button
              key={item}
              className={`grid h-9 min-w-9 place-items-center rounded-md border px-3 transition ${
                item === page
                  ? "border-orange-500 bg-orange-50 font-bold text-orange-600 dark:bg-orange-950 dark:text-orange-200"
                  : "border-border bg-card text-slate-600 hover:border-orange-200 hover:text-orange-600 dark:text-slate-300 dark:hover:border-orange-800 dark:hover:text-orange-300"
              }`}
              disabled={loading || item === page}
              onClick={() => onPage(item)}
            >
              {item}
            </button>
          )
        )}
      </div>
      <button
        className="grid h-9 min-w-9 place-items-center rounded-md border border-border bg-card px-3 text-slate-500 transition hover:border-orange-200 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:border-orange-800 dark:hover:text-orange-300"
        disabled={loading || page >= totalPages}
        onClick={() => onPage(page + 1)}
      >
        下一页
      </button>
      <select className={`${inputClass} !w-32 flex-none`} value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))} disabled={loading}>
        <option value={50}>50 条/页</option>
        <option value={100}>100 条/页</option>
        <option value={200}>200 条/页</option>
      </select>
      <input
        className={`${inputClass} !w-20 flex-none`}
        inputMode="numeric"
        value={jumpPage}
        onChange={(event) => onJumpInput(event.target.value.replace(/[^\d]/g, ""))}
        onKeyDown={(event) => {
          if (event.key === "Enter") onJump();
        }}
        disabled={loading}
        aria-label="跳转页码"
      />
      <button className="h-9 rounded-md bg-orange-500 px-4 font-bold text-white transition hover:bg-orange-600 disabled:opacity-50" disabled={loading} onClick={() => onJump()}>
        跳转
      </button>
      {pageError && <div className="w-full text-right text-xs text-rose-600 dark:text-rose-300">{pageError}</div>}
    </div>
  );
}

function paginationItems(page: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const items = new Set<number>([1, totalPages, page, page - 1, page + 1]);
  if (page <= 4) {
    [2, 3, 4, 5].forEach((item) => items.add(item));
  }
  if (page >= totalPages - 3) {
    [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1].forEach((item) => items.add(item));
  }
  const sorted = [...items].filter((item) => item >= 1 && item <= totalPages).sort((a, b) => a - b);
  const output: PageItem[] = [];
  for (const item of sorted) {
    const previous = output[output.length - 1];
    if (typeof previous === "number" && item - previous > 1) {
      output.push("ellipsis");
    }
    output.push(item);
  }
  return output;
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
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
      <div className={compact ? "mt-2 break-words text-[15px] font-bold leading-snug text-slate-950 dark:text-white" : "mt-2 truncate text-xl font-black tabular-nums text-slate-950 dark:text-white"} title={String(value)}>
        {value}
      </div>
    </div>
  );
}

function SearchTermRow({
  row,
  isOpportunity,
  onCopyKeyword,
  onToggleOpportunity
}: {
  row: AbaSearchTermRow;
  isOpportunity: boolean;
  onCopyKeyword: (keyword: string) => void;
  onToggleOpportunity: (row: AbaSearchTermRow) => void;
}) {
  const explanation = row.keywordCnExplanation?.trim() || "待生成中文解释";
  const amazonSearchUrl = amazonSearchHref(row.keyword);
  const departmentName = usefulDepartmentName(row.departmentName);
  return (
    <tr className="border-t border-border align-top text-foreground transition-colors hover:bg-sky-50/50 dark:hover:bg-slate-800/45">
      <td className="max-w-[280px] px-4 py-4">
        <div className="group/keyword flex items-center gap-1.5">
          <a
            className="font-semibold text-slate-950 transition hover:text-sky-700 hover:underline dark:text-slate-100 dark:hover:text-sky-300"
            href={amazonSearchUrl}
            target="_blank"
            rel="noreferrer"
            title={`在 Amazon 搜索：${row.keyword}`}
          >
            {row.keyword}
          </a>
          <button
            type="button"
            className="grid h-5 w-5 shrink-0 place-items-center rounded border border-transparent text-slate-300 opacity-70 transition hover:border-sky-100 hover:bg-sky-50 hover:text-sky-700 group-hover/keyword:text-slate-500 dark:text-slate-600 dark:hover:border-sky-900 dark:hover:bg-sky-950 dark:hover:text-sky-300 dark:group-hover/keyword:text-slate-400"
            title={`复制关键词：${row.keyword}`}
            aria-label={`复制关键词：${row.keyword}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onCopyKeyword(row.keyword);
            }}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className={`grid h-5 w-5 shrink-0 place-items-center rounded border transition ${
              isOpportunity
                ? "border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                : "border-transparent text-slate-300 opacity-70 hover:border-amber-100 hover:bg-amber-50 hover:text-amber-600 group-hover/keyword:text-slate-500 dark:text-slate-600 dark:hover:border-amber-900 dark:hover:bg-amber-950 dark:hover:text-amber-300 dark:group-hover/keyword:text-slate-400"
            }`}
            title={isOpportunity ? `从机会清单移除：${row.keyword}` : `加入机会清单：${row.keyword}`}
            aria-label={isOpportunity ? `从机会清单移除：${row.keyword}` : `加入机会清单：${row.keyword}`}
            aria-pressed={isOpportunity}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggleOpportunity(row);
            }}
          >
            {isOpportunity ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
          </button>
        </div>
        <div className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{explanation}</div>
        {departmentName ? (
          <div className="mt-2 inline-flex max-w-full rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400" title={departmentName}>
            <span className="truncate">{departmentName}</span>
          </div>
        ) : null}
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-right font-semibold tabular-nums">{formatRank(row.currentRank)}</td>
      <td className="whitespace-nowrap px-4 py-4 text-right tabular-nums text-slate-600 dark:text-slate-300">{formatRank(row.compareRank)}</td>
      <td className={`whitespace-nowrap px-4 py-4 text-right font-medium ${rankChangeClass(row.rankChange)}`}>{formatChange(row.rankChange)}</td>
      <td className="whitespace-nowrap px-4 py-4">
        <span className="inline-flex whitespace-nowrap">
          <Badge tone={changeTones[row.changeType]}>{changeLabels[row.changeType]}</Badge>
        </span>
      </td>
      {[0, 1, 2].map((index) => (
        <td key={index} className="px-4 py-4">
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

  if (!product) return <span className="text-slate-400 dark:text-slate-500">-</span>;
  const asin = product.asin?.trim().toUpperCase();
  const showImage = Boolean(imageUrl && !imageFailed);
  return (
    <div className="space-y-2">
      <div className="line-clamp-2 text-sm font-medium leading-snug text-slate-900 dark:text-slate-100" title={product.itemName || ""}>
        {product.itemName || "-"}
      </div>
      {asin && (
        <span className="group relative inline-flex">
          <a
            className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline dark:text-sky-300"
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
              <span className="flex h-28 items-center justify-center rounded border border-dashed border-border text-xs text-slate-500 dark:text-slate-400">暂无图片</span>
            )}
            <span className="mt-2 block truncate text-xs font-medium text-foreground">{asin}</span>
          </span>
        </span>
      )}
      <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">点击 {formatPercent(product.clickShare)}</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">转化 {formatPercent(product.conversionShare)}</span>
      </div>
    </div>
  );
}

function readableChangeType(value: ChangeType) {
  return changeLabels[value] ?? value;
}

function amazonSearchHref(keyword: string) {
  const query = encodeURIComponent(keyword.trim()).replaceAll("%20", "+");
  return `https://www.amazon.com/s?k=${query}`;
}

function planAccessNotice(member: MemberUser | null) {
  if (!member) return "";
  if (member.plan === "pro") return "";
  if (member.plan === "basic") return "专业版当前可查看前 50,000 条结果";
  return "体验版当前可查看前 1,000 条结果";
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

function todayLocalDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readDismissedNewWeekNotice() {
  try {
    const raw = window.localStorage.getItem(NEW_WEEK_NOTICE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<{ weekStart: string; date: string }>;
    if (typeof parsed.weekStart === "string" && typeof parsed.date === "string") {
      return { weekStart: parsed.weekStart, date: parsed.date };
    }
  } catch {
    window.localStorage.removeItem(NEW_WEEK_NOTICE_STORAGE_KEY);
  }
  return null;
}

function readSavedFilterModels(): SavedFilterModel[] {
  try {
    const raw = window.localStorage.getItem(SAVED_FILTER_MODELS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((value): SavedFilterModel | null => {
        if (!value || typeof value !== "object") return null;
        const candidate = value as Record<string, unknown>;
        const filters = savedFilterStateFromUnknown(candidate.filters);
        if (
          typeof candidate.id !== "string" ||
          typeof candidate.name !== "string" ||
          typeof candidate.updatedAt !== "string" ||
          !filters
        ) {
          return null;
        }
        return {
          id: candidate.id,
          name: candidate.name.slice(0, 30),
          filters,
          updatedAt: candidate.updatedAt
        };
      })
      .filter((value): value is SavedFilterModel => Boolean(value))
      .slice(0, MAX_SAVED_FILTER_MODELS);
  } catch {
    window.localStorage.removeItem(SAVED_FILTER_MODELS_STORAGE_KEY);
    return [];
  }
}

function persistSavedFilterModels(models: SavedFilterModel[]) {
  window.localStorage.setItem(SAVED_FILTER_MODELS_STORAGE_KEY, JSON.stringify(models));
}

function readOpportunityItems(): OpportunityItem[] {
  try {
    const raw = window.localStorage.getItem(OPPORTUNITY_LIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((value): OpportunityItem | null => {
        if (!value || typeof value !== "object") return null;
        const candidate = value as Record<string, unknown>;
        const changeType = typeof candidate.changeType === "string" ? candidate.changeType : "";
        if (
          typeof candidate.keyword !== "string" ||
          !candidate.keyword.trim() ||
          !isChangeType(changeType) ||
          changeType === "all"
        ) {
          return null;
        }
        return {
          keyword: candidate.keyword.trim(),
          keywordCnExplanation: typeof candidate.keywordCnExplanation === "string" ? candidate.keywordCnExplanation : "",
          departmentName: typeof candidate.departmentName === "string" ? candidate.departmentName : "",
          currentRank: nullableNumber(candidate.currentRank),
          compareRank: nullableNumber(candidate.compareRank),
          rankChange: nullableNumber(candidate.rankChange),
          changeType,
          weekStart: typeof candidate.weekStart === "string" ? candidate.weekStart : "",
          weekLabel: typeof candidate.weekLabel === "string" ? candidate.weekLabel : "",
          topAsins: Array.isArray(candidate.topAsins)
            ? candidate.topAsins.filter((asin): asin is string => typeof asin === "string").slice(0, 3)
            : [],
          addedAt: typeof candidate.addedAt === "string" ? candidate.addedAt : new Date().toISOString()
        };
      })
      .filter((value): value is OpportunityItem => Boolean(value))
      .slice(0, MAX_OPPORTUNITIES);
  } catch {
    window.localStorage.removeItem(OPPORTUNITY_LIST_STORAGE_KEY);
    return [];
  }
}

function persistOpportunityItems(items: OpportunityItem[]) {
  window.localStorage.setItem(OPPORTUNITY_LIST_STORAGE_KEY, JSON.stringify(items));
}

function opportunityKey(keyword: string) {
  return keyword.trim().toLocaleLowerCase();
}

function nullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function createSavedFilterModelId() {
  if (typeof window.crypto?.randomUUID === "function") return window.crypto.randomUUID();
  return `filter_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function savedFilterStateFromUnknown(value: unknown): FilterState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const text = (key: keyof FilterState) => (typeof candidate[key] === "string" ? String(candidate[key]) : "");
  const changeType = text("changeType");
  const sort = text("sort");

  return {
    keyword: text("keyword"),
    excludeKeyword: text("excludeKeyword"),
    asin: text("asin"),
    rankMin: text("rankMin"),
    rankMax: text("rankMax"),
    clickShareMin: text("clickShareMin"),
    clickShareMax: text("clickShareMax"),
    conversionShareMin: text("conversionShareMin"),
    conversionShareMax: text("conversionShareMax"),
    changeType: isChangeType(changeType) ? changeType : "all",
    sort: isSortType(sort) ? sort : "rank"
  };
}

type SearchParamReader = {
  get: (name: string) => string | null;
  has: (name: string) => boolean;
};

function filtersFromParams(params: SearchParamReader): FilterState {
  const changeType = params.get("changeType");
  const sort = params.get("sort");
  return {
    keyword: params.get("keyword") ?? "",
    excludeKeyword: params.get("excludeKeyword") ?? "",
    asin: params.get("asin") ?? "",
    rankMin: params.get("rankMin") ?? "",
    rankMax: params.get("rankMax") ?? "",
    clickShareMin: params.get("clickShareMin") ?? "",
    clickShareMax: params.get("clickShareMax") ?? "",
    conversionShareMin: params.get("conversionShareMin") ?? "",
    conversionShareMax: params.get("conversionShareMax") ?? "",
    changeType: isChangeType(changeType) ? changeType : "all",
    sort: isSortType(sort) ? sort : "rank"
  };
}

function buildSearchUrl({
  weekStart,
  compareWeekStart,
  filters,
  page,
  pageSize
}: {
  weekStart: string;
  compareWeekStart: string;
  filters: FilterState;
  page: number;
  pageSize: number;
}) {
  const params = new URLSearchParams();
  if (weekStart) params.set("weekStart", weekStart);
  params.set("compareWeekStart", compareWeekStart);
  params.set("changeType", filters.changeType);
  params.set("sort", filters.sort);
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));

  const optionalFields: Array<keyof FilterState> = [
    "keyword",
    "excludeKeyword",
    "asin",
    "rankMin",
    "rankMax",
    "clickShareMin",
    "clickShareMax",
    "conversionShareMin",
    "conversionShareMax"
  ];
  for (const field of optionalFields) {
    const value = String(filters[field] ?? "").trim();
    if (value) params.set(field, value);
  }

  return `/?${params.toString()}`;
}

function positiveInteger(value: string | null, fallback: number) {
  const next = Number(value);
  return Number.isInteger(next) && next > 0 ? next : fallback;
}

function pageSizeFromParams(value: string | null) {
  const next = positiveInteger(value, 50);
  return [50, 100, 200].includes(next) ? next : 50;
}

function isChangeType(value: string | null): value is FilterState["changeType"] {
  return value === "all" || value === "new" || value === "lost" || value === "up" || value === "down" || value === "flat";
}

function isSortType(value: string | null): value is FilterState["sort"] {
  return value === "rank" || value === "rankChange" || value === "clickShare" || value === "conversionShare" || value === "keyword";
}

function activeFilterChipsFor(filters: FilterState) {
  const chips: string[] = [];
  if (filters.keyword.trim()) chips.push(`包含：${filters.keyword.trim()}`);
  if (filters.excludeKeyword.trim()) chips.push(`排除：${filters.excludeKeyword.trim()}`);
  if (filters.asin.trim()) chips.push(`ASIN：${filters.asin.trim().toUpperCase()}`);
  if (filters.rankMin || filters.rankMax) chips.push(`排名：${filters.rankMin || "不限"}-${filters.rankMax || "不限"}`);
  if (filters.clickShareMin || filters.clickShareMax) chips.push(`点击份额：${filters.clickShareMin || "不限"}%-${filters.clickShareMax || "不限"}%`);
  if (filters.conversionShareMin || filters.conversionShareMax) chips.push(`转化份额：${filters.conversionShareMin || "不限"}%-${filters.conversionShareMax || "不限"}%`);
  if (filters.changeType !== "all") chips.push(`变化：${readableChangeType(filters.changeType)}`);
  if (filters.sort !== "rank") chips.push(`排序：${sortLabel(filters.sort)}`);
  return chips;
}

function sortLabel(sort: FilterState["sort"]) {
  const labels: Record<FilterState["sort"], string> = {
    rank: "搜索排名",
    rankChange: "排名变化",
    clickShare: "点击份额",
    conversionShare: "转化份额",
    keyword: "搜索词"
  };
  return labels[sort];
}

function matchingPresetKey(filters: FilterState) {
  return marketPresets.find((preset) =>
    Object.entries(preset.patch).every(([field, value]) => filters[field as keyof FilterState] === value)
  )?.key;
}

function countAdvancedFilters(filters: FilterState) {
  return [
    filters.excludeKeyword.trim(),
    filters.asin.trim(),
    filters.rankMin,
    filters.rankMax,
    filters.clickShareMin,
    filters.clickShareMax,
    filters.conversionShareMin,
    filters.conversionShareMax,
    filters.changeType !== "all" ? filters.changeType : "",
    filters.sort !== "rank" ? filters.sort : ""
  ].filter(Boolean).length;
}

function hasAdvancedFilters(filters: FilterState) {
  return countAdvancedFilters(filters) > 0;
}

function defaultCompareWeekStart(weeks: AbaWeek[], weekStart: string) {
  return weeks.find((week) => week.periodStart < weekStart)?.periodStart ?? "";
}

function needsRankChangeScope(filters: FilterState) {
  if (filters.sort !== "rankChange" || filters.changeType !== "all") return false;
  return !(
    filters.keyword.trim() ||
    filters.excludeKeyword.trim() ||
    filters.asin.trim() ||
    filters.rankMin ||
    filters.rankMax ||
    filters.clickShareMin ||
    filters.clickShareMax ||
    filters.conversionShareMin ||
    filters.conversionShareMax
  );
}

function usefulDepartmentName(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized || /^amazon\.com$/i.test(normalized)) return "";
  return normalized;
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
