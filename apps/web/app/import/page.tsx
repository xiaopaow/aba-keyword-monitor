"use client";

import { CloudUpload, FileSpreadsheet, Play, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fetchImportTask, uploadImport } from "../../lib/api";
import { Button, Card, CardHeader, Field, inputClass, MetricCard, PageHeader } from "../../components/ui";

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [reportDate, setReportDate] = useState("2026-05-20");
  const [task, setTask] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchImportTask().then(setTask);
  }, []);

  const preview = useMemo(() => {
    if (!file) return [];
    return [
      { searchTerm: "wireless earbuds", searchFrequencyRank: 256 },
      { searchTerm: "bluetooth speaker", searchFrequencyRank: 1789 },
      { searchTerm: "phone case", searchFrequencyRank: 89 }
    ];
  }, [file]);

  async function startUpload() {
    if (!file) return;
    setError("");
    try {
      setTask(await uploadImport(file, reportDate));
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入失败");
    }
  }

  const progress = task?.totalRows ? Math.round((task.processedRows / task.totalRows) * 100) : 0;

  return (
    <>
      <PageHeader title="数据导入" description="支持 JSON、CSV、XLSX 文件导入，后台异步解析并显示进度。" />
      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <Card>
          <CardHeader title="上传文件" />
          <div className="space-y-4 p-4">
            <label className="flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-blue-300 bg-blue-50/60 p-6 text-center dark:bg-blue-500/10">
              <CloudUpload className="h-10 w-10 text-blue-600" />
              <span className="mt-3 text-sm font-medium">{file ? file.name : "点击上传或拖拽文件到此处"}</span>
              <span className="mt-1 text-xs text-slate-500">支持 JSON、CSV、XLSX，建议百万级数据使用 CSV</span>
              <input className="hidden" type="file" accept=".csv,.json,.xlsx,.xls" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            </label>

            <div className="grid gap-3 md:grid-cols-3">
              <Field label="数据日期">
                <input className={inputClass} type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} />
              </Field>
              <Field label="关键词字段">
                <select className={inputClass}><option>searchTerm</option><option>keyword</option></select>
              </Field>
              <Field label="排名字段">
                <select className={inputClass}><option>searchFrequencyRank</option><option>rank</option></select>
              </Field>
            </div>

            {preview.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm font-medium">
                  <FileSpreadsheet className="h-4 w-4" />
                  预览前100行
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800">
                    <tr><th className="px-3 py-2 text-left">searchTerm</th><th className="px-3 py-2 text-left">searchFrequencyRank</th></tr>
                  </thead>
                  <tbody>
                    {preview.map((row) => (
                      <tr key={row.searchTerm} className="border-t border-border"><td className="px-3 py-2">{row.searchTerm}</td><td className="px-3 py-2">{row.searchFrequencyRank}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {error && <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
            <Button disabled={!file} onClick={startUpload}><Play className="h-4 w-4" />开始导入</Button>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="导入进度"
              action={<button title="刷新进度" aria-label="刷新进度" onClick={() => fetchImportTask().then(setTask)}><RefreshCw className="h-4 w-4" /></button>}
            />
            <div className="space-y-4 p-4">
              <div>
                <div className="mb-2 flex justify-between text-sm"><span>{task?.fileName ?? "暂无任务"}</span><span>{progress}%</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div className="h-full rounded-full bg-blue-600" style={{ width: `${progress}%` }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <MetricCard label="总行数" value={(task?.totalRows ?? 0).toLocaleString()} />
                <MetricCard label="已处理" value={(task?.processedRows ?? 0).toLocaleString()} />
                <MetricCard label="成功行" value={(task?.successRows ?? 0).toLocaleString()} />
                <MetricCard label="失败行" value={(task?.failedRows ?? 0).toLocaleString()} />
                <MetricCard label="重复行" value={(task?.duplicateRows ?? 0).toLocaleString()} />
                <MetricCard label="状态" value={task?.status ?? "-"} />
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
