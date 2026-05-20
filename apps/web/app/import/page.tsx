"use client";

import { AlertCircle, CheckCircle2, CloudUpload, FileSpreadsheet, Loader2, Play, RefreshCw, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ImportTask } from "@aba/shared";
import { fetchImportTaskById, uploadImport } from "../../lib/api";
import { Badge, Button, Card, CardHeader, Field, inputClass, MetricCard, PageHeader } from "../../components/ui";

type UploadState = "idle" | "selected" | "uploading" | "processing" | "success" | "failed";

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [reportDate, setReportDate] = useState("2026-05-20");
  const [task, setTask] = useState<ImportTask | null>(null);
  const [taskId, setTaskId] = useState<number | null>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [message, setMessage] = useState("请选择 JSON、CSV 或 XLSX 文件。");

  useEffect(() => {
    if (!taskId || state === "success" || state === "failed") return;
    const timer = window.setInterval(async () => {
      const next = await fetchImportTaskById(taskId);
      if (!next) return;
      setTask(next);
      if (next.status === "success") {
        setState("success");
        setMessage("导入完成，可以到总览看板或关键词监控查看数据。");
      }
      if (next.status === "failed" || next.status === "cancelled") {
        setState("failed");
        setMessage(next.errorMessage || "导入失败，请检查文件格式和字段映射。");
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [taskId, state]);

  const fileSizeText = file ? formatBytes(file.size) : "";
  const isLargeFile = file ? file.size > 100 * 1024 * 1024 : false;

  const preview = useMemo(() => {
    if (!file || file.size > 10 * 1024 * 1024) return [];
    return [
      { searchTerm: "wireless earbuds", searchFrequencyRank: 256 },
      { searchTerm: "bluetooth speaker", searchFrequencyRank: 1789 },
      { searchTerm: "phone case", searchFrequencyRank: 89 }
    ];
  }, [file]);

  function onFileSelected(nextFile: File | null) {
    setFile(nextFile);
    setTask(null);
    setTaskId(null);
    if (!nextFile) {
      setState("idle");
      setMessage("请选择 JSON、CSV 或 XLSX 文件。");
      return;
    }

    setState("selected");
    const largeNotice =
      nextFile.size > 100 * 1024 * 1024
        ? "这是大文件，点击开始后会先完整上传，期间页面不会有行数进度；Render 免费实例可能超时，百万级数据建议用 CSV。"
        : "文件已选择，确认日期和字段后点击开始导入。";
    setMessage(`${nextFile.name} (${formatBytes(nextFile.size)}) 已选择。${largeNotice}`);
  }

  async function startUpload() {
    if (!file) return;
    setState("uploading");
    setMessage(`正在上传 ${file.name}，请不要关闭页面。大文件上传完成后才会出现任务进度。`);
    try {
      const created = await uploadImport(file, reportDate);
      setTaskId(created.taskId);
      setTask(created);
      setState("processing");
      setMessage(`上传完成，已创建导入任务 #${created.taskId}，正在后台解析入库。`);
    } catch (err) {
      setState("failed");
      setMessage(err instanceof Error ? err.message : "上传失败，请检查网络或文件大小。");
    }
  }

  async function refreshTask() {
    if (!taskId) return;
    const next = await fetchImportTaskById(taskId);
    if (next) setTask(next);
  }

  const progress = task?.totalRows ? Math.round((task.processedRows / task.totalRows) * 100) : state === "uploading" ? 5 : 0;
  const canStart = Boolean(file) && state !== "uploading" && state !== "processing";

  return (
    <>
      <PageHeader title="数据导入" description="支持 JSON、CSV、XLSX 文件导入，后台异步解析并显示进度。" />
      <StatusBanner state={state} message={message} />

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <Card>
          <CardHeader title="上传文件" />
          <div className="space-y-4 p-4">
            <label className="flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-blue-300 bg-blue-50/60 p-6 text-center dark:bg-blue-500/10">
              <CloudUpload className="h-10 w-10 text-blue-600" />
              <span className="mt-3 text-sm font-medium">{file ? file.name : "点击上传或拖拽文件到此处"}</span>
              <span className="mt-1 text-xs text-slate-500">支持 JSON、CSV、XLSX，建议百万级数据使用 CSV</span>
              <input className="hidden" type="file" accept=".csv,.json,.xlsx,.xls" onChange={(event) => onFileSelected(event.target.files?.[0] ?? null)} />
            </label>

            {file && (
              <div className="rounded-lg border border-border bg-slate-50 p-3 text-sm dark:bg-slate-800">
                <div className="flex flex-wrap items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-blue-600" />
                  <span className="font-medium">{file.name}</span>
                  <Badge tone={isLargeFile ? "yellow" : "green"}>{fileSizeText}</Badge>
                </div>
                {isLargeFile && (
                  <div className="mt-2 text-xs text-amber-700 dark:text-amber-200">
                    大文件上传不会立刻显示行数进度。3GB JSON 在免费云实例上很容易超时，建议转成 CSV 后分批导入。
                  </div>
                )}
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-3">
              <Field label="数据日期">
                <input className={inputClass} type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} />
              </Field>
              <Field label="关键词字段">
                <select className={inputClass}>
                  <option>searchTerm</option>
                  <option>keyword</option>
                </select>
              </Field>
              <Field label="排名字段">
                <select className={inputClass}>
                  <option>searchFrequencyRank</option>
                  <option>rank</option>
                </select>
              </Field>
            </div>

            {preview.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm font-medium">
                  <FileSpreadsheet className="h-4 w-4" />
                  小文件预览
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800">
                    <tr>
                      <th className="px-3 py-2 text-left">searchTerm</th>
                      <th className="px-3 py-2 text-left">searchFrequencyRank</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row) => (
                      <tr key={row.searchTerm} className="border-t border-border">
                        <td className="px-3 py-2">{row.searchTerm}</td>
                        <td className="px-3 py-2">{row.searchFrequencyRank}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <Button disabled={!canStart} onClick={startUpload}>
              {state === "uploading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {state === "uploading" ? "上传中" : "开始导入"}
            </Button>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="导入进度"
              action={
                <button title="刷新进度" aria-label="刷新进度" disabled={!taskId} onClick={refreshTask}>
                  <RefreshCw className="h-4 w-4" />
                </button>
              }
            />
            <div className="space-y-4 p-4">
              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span>{task?.fileName ?? file?.name ?? "暂无任务"}</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <MetricCard label="总行数" value={(task?.totalRows ?? 0).toLocaleString()} />
                <MetricCard label="已处理" value={(task?.processedRows ?? 0).toLocaleString()} />
                <MetricCard label="成功行" value={(task?.successRows ?? 0).toLocaleString()} />
                <MetricCard label="失败行" value={(task?.failedRows ?? 0).toLocaleString()} />
                <MetricCard label="重复行" value={(task?.duplicateRows ?? 0).toLocaleString()} />
                <MetricCard label="状态" value={task?.status ?? state} />
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function StatusBanner({ state, message }: { state: UploadState; message: string }) {
  const icon =
    state === "success" ? <CheckCircle2 className="h-4 w-4" /> : state === "failed" ? <XCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />;
  const color =
    state === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : state === "failed"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : "border-blue-200 bg-blue-50 text-blue-800";

  return (
    <div className={`mb-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${color}`}>
      {icon}
      <span>{message}</span>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}
