"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Eye, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { KeywordComparison } from "@aba/shared";
import { fetchKeywords } from "../../lib/api";
import { Badge, Button, Field, Filters, inputClass, PageHeader } from "../../components/ui";
import { DataTable } from "../../components/data-table";

export default function KeywordsPage() {
  const [rows, setRows] = useState<KeywordComparison[]>([]);
  const [keywordQuery, setKeywordQuery] = useState("");

  async function loadKeywords() {
    const data = await fetchKeywords();
    setRows(data.rows);
  }

  useEffect(() => {
    loadKeywords();
  }, []);

  const visibleRows = useMemo(() => {
    const query = keywordQuery.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => row.keyword.toLowerCase().includes(query));
  }, [keywordQuery, rows]);

  const columns = useMemo<ColumnDef<KeywordComparison>[]>(
    () => [
      { accessorKey: "keyword", header: "关键词" },
      { accessorKey: "currentRank", header: "当前排名", cell: ({ row }) => row.original.currentRank ?? "-" },
      { accessorKey: "compareRank", header: "对比排名", cell: ({ row }) => row.original.compareRank ?? "-" },
      {
        accessorKey: "changeValue",
        header: "变化值",
        cell: ({ row }) => {
          const value = row.original.changeValue;
          return value === null ? "-" : <span className={value >= 0 ? "text-emerald-600" : "text-rose-600"}>{value > 0 ? `+${value}` : value}</span>;
        }
      },
      {
        accessorKey: "changeType",
        header: "变化类型",
        cell: ({ row }) => <ChangeBadge type={row.original.changeType} />
      },
      { accessorKey: "bestRank", header: "历史最佳", cell: ({ row }) => row.original.bestRank ?? "-" },
      { accessorKey: "worstRank", header: "历史最差", cell: ({ row }) => row.original.worstRank ?? "-" },
      { accessorKey: "tag", header: "标签", cell: ({ row }) => row.original.tag ? <Badge tone="blue">{row.original.tag}</Badge> : "-" },
      {
        id: "actions",
        header: "操作",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Link href={`/keywords/${encodeURIComponent(row.original.keyword)}`} aria-label="查看详情" title="查看详情" className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800">
              <Eye className="h-4 w-4" />
            </Link>
          </div>
        )
      }
    ],
    []
  );

  return (
    <>
      <PageHeader title="关键词监控" description="支持多维度筛选和排序，快速定位重点关键词。" />
      <Filters>
        <Field label="关键词搜索"><input className={inputClass} placeholder="wireless earbuds" value={keywordQuery} onChange={(event) => setKeywordQuery(event.target.value)} /></Field>
        <Field label="当前日期"><input className={inputClass} type="date" defaultValue="2026-05-20" /></Field>
        <Field label="对比日期"><input className={inputClass} type="date" defaultValue="2026-05-19" /></Field>
        <Field label="排名区间"><select className={inputClass}><option>全部</option><option>Top100</option><option>Top1000</option><option>Top10000</option></select></Field>
        <Field label="变化类型"><select className={inputClass}><option>全部</option><option>新增</option><option>消失</option><option>上升</option><option>下降</option><option>无变化</option></select></Field>
        <Field label="标签"><select className={inputClass}><option>全部</option><option>核心词</option><option>长尾词</option><option>产品词</option></select></Field>
        <Field label="收藏状态"><select className={inputClass}><option>全部</option><option>已收藏</option><option>未收藏</option></select></Field>
        <div className="flex items-end">
          <Button className="w-full" onClick={loadKeywords}><Search className="h-4 w-4" />刷新</Button>
        </div>
      </Filters>
      <DataTable data={visibleRows} columns={columns} />
    </>
  );
}

function ChangeBadge({ type }: { type: KeywordComparison["changeType"] }) {
  const map = {
    new: ["新增", "green"],
    lost: ["消失", "red"],
    up: ["上升", "green"],
    down: ["下降", "red"],
    flat: ["无变化", "slate"]
  } as const;
  const [label, tone] = map[type];
  return <Badge tone={tone}>{label}</Badge>;
}
