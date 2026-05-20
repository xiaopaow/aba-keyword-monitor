"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Eye } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { OpportunityRow } from "@aba/shared";
import { fetchOpportunities } from "../../lib/api";
import { Badge, Button, Field, Filters, inputClass, PageHeader } from "../../components/ui";
import { DataTable } from "../../components/data-table";

export default function OpportunitiesPage() {
  const [rows, setRows] = useState<OpportunityRow[]>([]);
  async function loadRows() {
    const data = await fetchOpportunities();
    setRows(data.rows);
  }
  useEffect(() => { loadRows(); }, []);

  const columns = useMemo<ColumnDef<OpportunityRow>[]>(() => [
    { accessorKey: "keyword", header: "关键词" },
    { accessorKey: "rank", header: "当前排名" },
    { accessorKey: "sevenDayChange", header: "7天变化", cell: ({ row }) => row.original.sevenDayChange ?? "-" },
    { accessorKey: "thirtyDayChange", header: "30天变化", cell: ({ row }) => row.original.thirtyDayChange ?? "-" },
    { accessorKey: "type", header: "机会类型", cell: ({ row }) => <Badge tone="green">{typeLabel(row.original.type)}</Badge> },
    { accessorKey: "score", header: "机会评分" },
    { accessorKey: "suggestion", header: "建议动作" },
    { id: "actions", header: "操作", cell: ({ row }) => <Link title="查看详情" href={`/keywords/${encodeURIComponent(row.original.keyword)}`}><Eye className="h-4 w-4" /></Link> }
  ], []);

  return (
    <>
      <PageHeader title="机会词分析" description="基于规则识别值得重点跟进的关键词。" />
      <Filters>
        <Field label="分组维度"><select className={inputClass}><option>全部机会词</option><option>新增机会词</option><option>爆发词</option><option>持续上涨词</option></select></Field>
        <Field label="排名区间"><select className={inputClass}><option>全部</option><option>Top1000</option><option>Top5000</option></select></Field>
        <Field label="时间范围"><select className={inputClass}><option>近7天</option><option>近30天</option></select></Field>
        <div className="flex items-end"><Button className="w-full" onClick={loadRows}>刷新</Button></div>
      </Filters>
      <DataTable data={rows} columns={columns} />
    </>
  );
}

function typeLabel(type: OpportunityRow["type"]) {
  return {
    new_opportunity: "新增机会词",
    burst: "爆发词",
    rising: "持续上涨词",
    high_potential: "高潜力词",
    stable_core: "稳定核心词"
  }[type];
}
