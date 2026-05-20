"use client";

import { AlertCircle, CheckCircle2, CloudUpload, FileSpreadsheet, Loader2, Play, RefreshCw, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ImportTask } from "@aba/shared";
import { fetchImportTaskById, uploadImport } from "../../lib/api";
import { Badge, Button, Card, CardHeader, Field, inputClass, MetricCard, PageHeader } from "../../components/ui";

type ImportState = "idle" | "previewing" | "ready" | "uploading" | "processing" | "success" | "failed";

interface PreviewRow {
  keyword: string;
  rank: number;
  reportDate: string;
}

interface PreviewStats {
  scannedRows: number;
  validRows: number;
  duplicateRows: number;
  invalidRows: number;
  bytesRead: number;
  stoppedEarly: boolean;
  warning?: string;
}

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [reportDate, setReportDate] = useState("2026-05-20");
  const [state, setState] = useState<ImportState>("idle");
  const [message, setMessage] = useState("请选择 JSON、CSV 或 XLSX 文件。");
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [previewStats, setPreviewStats] = useState<PreviewStats | null>(null);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [task, setTask] = useState<ImportTask | null>(null);
  const [taskId, setTaskId] = useState<number | null>(null);
  const previewRunId = useRef(0);

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

  async function onFileSelected(nextFile: File | null) {
    const runId = previewRunId.current + 1;
    previewRunId.current = runId;
    setFile(nextFile);
    setTask(null);
    setTaskId(null);
    setUploadProgress(0);
    setPreviewRows([]);
    setPreviewStats(null);
    setPreviewProgress(0);

    if (!nextFile) {
      setState("idle");
      setMessage("请选择 JSON、CSV 或 XLSX 文件。");
      return;
    }

    setState("previewing");
    setMessage(`正在清洗预览 ${nextFile.name}，只读取必要片段并提取前 100 条唯一关键词。`);

    try {
      const result = await buildPreview(nextFile, reportDate, (progress) => {
        if (previewRunId.current === runId) setPreviewProgress(progress);
      });
      if (previewRunId.current !== runId) return;
      setPreviewRows(result.rows);
      setPreviewStats(result.stats);
      setPreviewProgress(100);
      setState(result.rows.length > 0 ? "ready" : "failed");
      setMessage(
        result.rows.length > 0
          ? `${nextFile.name} 已清洗出 ${result.rows.length} 条预览数据。确认字段无误后可开始上传导入。`
          : "没有清洗出可导入数据，请检查 searchTerm 和 searchFrequencyRank 字段。"
      );
    } catch (error) {
      if (previewRunId.current !== runId) return;
      setState("failed");
      setMessage(error instanceof Error ? error.message : "清洗预览失败，请检查文件格式。");
    }
  }

  async function startUpload() {
    if (!file || previewRows.length === 0) return;
    setState("uploading");
    setUploadProgress(0);
    setMessage(`正在上传 ${file.name}，请不要关闭页面。上传完成后会自动创建导入任务。`);
    try {
      const created = await uploadImport(file, reportDate, setUploadProgress);
      setTaskId(created.taskId);
      setTask(created);
      setState("processing");
      setMessage(`上传完成，已创建导入任务 #${created.taskId}，正在后台流式解析并入库。`);
    } catch (error) {
      setState("failed");
      setMessage(error instanceof Error ? error.message : "上传失败，请检查网络、文件大小或 Render 实例限制。");
    }
  }

  async function refreshTask() {
    if (!taskId) return;
    const next = await fetchImportTaskById(taskId);
    if (next) setTask(next);
  }

  const isLargeFile = file ? file.size > 100 * 1024 * 1024 : false;
  const backendProgress = task?.totalRows ? Math.round((task.processedRows / task.totalRows) * 100) : 0;
  const progress = state === "previewing" ? previewProgress : state === "uploading" ? uploadProgress : state === "processing" ? backendProgress : state === "success" ? 100 : 0;
  const canStart = state === "ready" && previewRows.length > 0;

  return (
    <>
      <PageHeader title="数据导入" description="先本地清洗预览前 100 条，再确认上传并后台流式导入。" />
      <StatusBanner state={state} message={message} />

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Card>
          <CardHeader title="选择文件与清洗预览" />
          <div className="space-y-4 p-4">
            <label className="flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-blue-300 bg-blue-50/60 p-6 text-center dark:bg-blue-500/10">
              <CloudUpload className="h-10 w-10 text-blue-600" />
              <span className="mt-3 text-sm font-medium">{file ? file.name : "点击上传或拖拽文件到此处"}</span>
              <span className="mt-1 text-xs text-slate-500">支持 JSON、CSV、XLSX。百万级数据建议优先使用 CSV。</span>
              <input className="hidden" type="file" accept=".csv,.json,.xlsx,.xls" onChange={(event) => onFileSelected(event.target.files?.[0] ?? null)} />
            </label>

            {file && (
              <div className="rounded-lg border border-border bg-slate-50 p-3 text-sm dark:bg-slate-800">
                <div className="flex flex-wrap items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-blue-600" />
                  <span className="font-medium">{file.name}</span>
                  <Badge tone={isLargeFile ? "yellow" : "green"}>{formatBytes(file.size)}</Badge>
                  <Badge tone="slate">{file.name.split(".").pop()?.toUpperCase() || "FILE"}</Badge>
                </div>
                {isLargeFile && (
                  <div className="mt-2 text-xs text-amber-700 dark:text-amber-200">
                    大文件预览只读取必要片段，不会整文件载入内存。3GB JSON 直接上传到 Render 免费实例仍可能超时，后续建议做本地转 CSV 或分片导入。
                  </div>
                )}
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-3">
              <Field label="数据日期">
                <input className={inputClass} type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} />
              </Field>
              <Field label="关键词字段">
                <select className={inputClass} value="searchTerm" disabled>
                  <option>searchTerm</option>
                </select>
              </Field>
              <Field label="排名字段">
                <select className={inputClass} value="searchFrequencyRank" disabled>
                  <option>searchFrequencyRank</option>
                </select>
              </Field>
            </div>

            <div className="rounded-lg border border-border bg-card">
              <div className="border-b border-border px-3 py-2 text-sm font-medium">字段清洗规则</div>
              <div className="grid gap-2 p-3 text-sm text-slate-600 dark:text-slate-300 md:grid-cols-2">
                <div>保留：searchTerm → keyword</div>
                <div>保留：searchFrequencyRank → rank</div>
                <div>补充：页面选择的数据日期 → reportDate</div>
                <div>忽略：clickedAsin、clickedItemName、clickShare、conversionShare</div>
              </div>
            </div>

            <PreviewTable rows={previewRows} stats={previewStats} />

            <Button disabled={!canStart} onClick={startUpload}>
              {state === "uploading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              确认上传并导入
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
                  <span>{progressLabel(state)}</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <MetricCard label="预览有效" value={previewStats?.validRows ?? previewRows.length} />
                <MetricCard label="预览重复" value={previewStats?.duplicateRows ?? 0} />
                <MetricCard label="预览无效" value={previewStats?.invalidRows ?? 0} />
                <MetricCard label="已读大小" value={previewStats ? formatBytes(previewStats.bytesRead) : "-"} />
                <MetricCard label="后端已处理" value={(task?.processedRows ?? 0).toLocaleString()} />
                <MetricCard label="状态" value={task?.status ?? state} />
              </div>
              {previewStats?.warning && <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">{previewStats.warning}</div>}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function PreviewTable({ rows, stats }: { rows: PreviewRow[]; stats: PreviewStats | null }) {
  if (!rows.length) {
    return (
      <div className="rounded-lg border border-border bg-slate-50 px-3 py-6 text-center text-sm text-slate-500 dark:bg-slate-800">
        选择文件后会在这里显示清洗出的前 100 条唯一关键词。
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 text-sm font-medium">
        <span>清洗预览</span>
        <span className="text-xs font-normal text-slate-500">
          扫描 {stats?.scannedRows ?? rows.length} 条，展示 {rows.length} 条
        </span>
      </div>
      <div className="max-h-80 overflow-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500 dark:bg-slate-800">
            <tr>
              <th className="px-3 py-2 text-left">keyword</th>
              <th className="px-3 py-2 text-left">rank</th>
              <th className="px-3 py-2 text-left">reportDate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.keyword}-${row.rank}`} className="border-t border-border">
                <td className="px-3 py-2">{row.keyword}</td>
                <td className="px-3 py-2">{row.rank}</td>
                <td className="px-3 py-2">{row.reportDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBanner({ state, message }: { state: ImportState; message: string }) {
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

async function buildPreview(file: File, reportDate: string, onProgress: (progress: number) => void): Promise<{ rows: PreviewRow[]; stats: PreviewStats }> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "json") return previewJson(file, reportDate, onProgress);
  if (extension === "csv") return previewCsv(file, reportDate, onProgress);
  throw new Error("当前预览优先支持 JSON/CSV。XLSX 可上传导入，但暂不做本地预览。");
}

async function previewJson(file: File, reportDate: string, onProgress: (progress: number) => void) {
  const reader = file.stream().getReader();
  const decoder = new TextDecoder();
  const rows: PreviewRow[] = [];
  const seen = new Set<string>();
  const stats: PreviewStats = { scannedRows: 0, validRows: 0, duplicateRows: 0, invalidRows: 0, bytesRead: 0, stoppedEarly: false };
  let current = "";
  let depth = 0;
  let inString = false;
  let escape = false;
  const maxPreviewBytes = Math.min(file.size, 256 * 1024 * 1024);

  const consumeRecord = (record: unknown) => {
    stats.scannedRows += 1;
    const source = record as { searchTerm?: unknown; searchFrequencyRank?: unknown };
    const keyword = String(source.searchTerm ?? "").trim();
    const rank = Number(source.searchFrequencyRank);
    if (!keyword || !Number.isInteger(rank) || rank <= 0) {
      stats.invalidRows += 1;
      return;
    }
    const key = `${keyword}\u0000${rank}`;
    if (seen.has(key)) {
      stats.duplicateRows += 1;
      return;
    }
    seen.add(key);
    rows.push({ keyword, rank, reportDate });
    stats.validRows += 1;
  };

  while (rows.length < 100) {
    const { value, done } = await reader.read();
    if (done) break;
    stats.bytesRead += value.byteLength;
    const text = decoder.decode(value, { stream: true });

    for (const char of text) {
      if (depth === 0) {
        if (char === "{") {
          depth = 1;
          current = "{";
        }
        continue;
      }

      current += char;
      if (inString) {
        if (escape) escape = false;
        else if (char === "\\") escape = true;
        else if (char === "\"") inString = false;
        continue;
      }
      if (char === "\"") inString = true;
      else if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            consumeRecord(JSON.parse(current));
          } catch {
            stats.invalidRows += 1;
          }
          current = "";
          if (rows.length >= 100) break;
        }
      }
    }

    onProgress(Math.min(99, Math.round((stats.bytesRead / maxPreviewBytes) * 100)));
    if (stats.bytesRead >= maxPreviewBytes && rows.length < 100) {
      stats.warning = `已读取 ${formatBytes(stats.bytesRead)}，只找到 ${rows.length} 条有效预览。请检查 JSON 字段是否为 searchTerm/searchFrequencyRank。`;
      break;
    }
  }

  stats.stoppedEarly = rows.length >= 100;
  await reader.cancel().catch(() => undefined);
  onProgress(100);
  return { rows, stats };
}

async function previewCsv(file: File, reportDate: string, onProgress: (progress: number) => void) {
  const reader = file.stream().getReader();
  const decoder = new TextDecoder();
  const rows: PreviewRow[] = [];
  const seen = new Set<string>();
  const stats: PreviewStats = { scannedRows: 0, validRows: 0, duplicateRows: 0, invalidRows: 0, bytesRead: 0, stoppedEarly: false };
  let pending = "";
  let headers: string[] | null = null;

  while (rows.length < 100) {
    const { value, done } = await reader.read();
    if (done) break;
    stats.bytesRead += value.byteLength;
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      if (!headers) {
        headers = splitCsvLine(line);
        continue;
      }
      stats.scannedRows += 1;
      const values = splitCsvLine(line);
      const record = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
      const keyword = String(record.searchTerm ?? record.keyword ?? "").trim();
      const rank = Number(record.searchFrequencyRank ?? record.rank);
      if (!keyword || !Number.isInteger(rank) || rank <= 0) {
        stats.invalidRows += 1;
        continue;
      }
      const key = `${keyword}\u0000${rank}`;
      if (seen.has(key)) {
        stats.duplicateRows += 1;
        continue;
      }
      seen.add(key);
      rows.push({ keyword, rank, reportDate });
      stats.validRows += 1;
      if (rows.length >= 100) break;
    }
    onProgress(Math.min(99, Math.round((stats.bytesRead / Math.min(file.size, 64 * 1024 * 1024)) * 100)));
  }

  stats.stoppedEarly = rows.length >= 100;
  await reader.cancel().catch(() => undefined);
  onProgress(100);
  return { rows, stats };
}

function splitCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      if (inQuotes && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function progressLabel(state: ImportState) {
  if (state === "previewing") return "本地清洗预览";
  if (state === "uploading") return "文件上传";
  if (state === "processing") return "后台导入";
  if (state === "success") return "导入完成";
  if (state === "failed") return "导入失败";
  return "等待文件";
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
