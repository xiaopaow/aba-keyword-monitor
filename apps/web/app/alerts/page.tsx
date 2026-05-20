"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Eye } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { AlertRow } from "@aba/shared";
import { fetchAlerts } from "../../lib/api";
import { Badge, Button, Field, Filters, inputClass, PageHeader } from "../../components/ui";
import { DataTable } from "../../components/data-table";

export default function AlertsPage() {
  const [rows, setRows] = useState<AlertRow[]>([]);
  async function loadRows() {
    const data = await fetchAlerts();
    setRows(data.rows);
  }
  useEffect(() => { loadRows(); }, []);

  const columns = useMemo<ColumnDef<AlertRow>[]>(() => [
    { accessorKey: "keyword", header: "关键词" },
    { accessorKey: "type", header: "风险类型", cell: ({ row }) => <Badge tone="red">{typeLabel(row.original.type)}</Badge> },
    { accessorKey: "currentRank", header: "当前排名", cell: ({ row }) => row.original.currentRank ?? "消失" },
    { accessorKey: "compareRank", header: "对比排名", cell: ({ row }) => row.original.compareRank ?? "-" },
    { accessorKey: "changeValue", header: "变化值", cell: ({ row }) => row.original.changeValue ?? "-" },
    { accessorKey: "level", header: "风险等级", cell: ({ row }) => <Badge tone={row.original.level === "high" ? "red" : row.original.level === "medium" ? "yellow" : "slate"}>{levelLabel(row.original.level)}</Badge> },
    { accessorKey: "alertDate", header: "触发日期" },
    { accessorKey: "status", header: "状态", cell: ({ row }) => row.original.status === "handled" ? "已处理" : "未处理" },
    { id: "actions", header: "操作", cell: ({ row }) => <Link title="查看详情" href={`/keywords/${encodeURIComponent(row.original.keyword)}`}><Eye className="h-4 w-4" /></Link> }
  ], []);

  return (
    <>
      <PageHeader title="风险预警" description="及时发现关键词排名异常下跌、消失和大幅波动。" />
      <Filters>
        <Field label="风险类型"><select className={inputClass}><option>全部</option><option>跌出Top100</option><option>跌出Top1000</option><option>连续下跌</option><option>关键词消失</option></select></Field>
        <Field label="排名区间"><select className={inputClass}><option>全部</option><option>Top100</option><option>Top1000</option></select></Field>
        <Field label="时间范围"><select className={inputClass}><option>近7天</option><option>近30天</option></select></Field>
        <Field label="状态"><select className={inputClass}><option>全部</option><option>未处理</option><option>已处理</option></select></Field>
        <div className="flex items-end"><Button className="w-full" onClick={loadRows}>刷新</Button></div>
      </Filters>
      <DataTable data={rows} columns={columns} />
    </>
  );
}

function typeLabel(type: AlertRow["type"]) {
  return {
    drop_top100: "跌出Top100",
    drop_top1000: "跌出Top1000",
    continuous_down: "连续下跌",
    lost: "关键词消失",
    large_fluctuation: "大幅波动",
    favorite_down: "收藏词下跌"
  }[type];
}

function levelLabel(level: AlertRow["level"]) {
  return { high: "高", medium: "中", low: "低" }[level];
}
