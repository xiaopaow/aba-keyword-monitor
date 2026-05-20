import clsx from "clsx";

export function PageHeader({ title, description, actions }: { title: string; description: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-end">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">{title}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      {actions}
    </div>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={clsx("rounded-lg border border-border bg-card shadow-sm", className)}>{children}</section>;
}

export function CardHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between border-b border-border px-4 py-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {action}
    </div>
  );
}

export function MetricCard({ label, value, delta }: { label: string; value: string | number; delta?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {delta && <div className={clsx("mt-2 text-xs", delta.startsWith("-") ? "text-rose-600" : "text-emerald-600")}>{delta}</div>}
    </Card>
  );
}

export function Filters({ children }: { children: React.ReactNode }) {
  return <div className="mb-4 grid gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-5">{children}</div>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-xs text-slate-500 dark:text-slate-400">
      {label}
      {children}
    </label>
  );
}

export const inputClass =
  "h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary";

export function Badge({ children, tone = "blue" }: { children: React.ReactNode; tone?: "blue" | "green" | "red" | "yellow" | "slate" }) {
  const tones = {
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200",
    green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200",
    red: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200",
    yellow: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200",
    slate: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
  };
  return <span className={clsx("inline-flex rounded px-2 py-1 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function Button({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={clsx(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-white shadow-sm hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
