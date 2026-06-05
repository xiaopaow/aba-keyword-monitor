"use client";

import clsx from "clsx";

export function WhaleLogo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={clsx("flex items-center gap-3", className)}>
      <div className="relative grid size-11 place-items-center overflow-hidden rounded-2xl bg-[#062B45] shadow-lg shadow-sky-950/15 ring-1 ring-white/20">
        <svg viewBox="0 0 64 64" aria-hidden="true" className="size-9">
          <defs>
            <linearGradient id="whaleLogoGradient" x1="8" y1="12" x2="56" y2="54">
              <stop stopColor="#0EA5E9" />
              <stop offset="0.55" stopColor="#14B8A6" />
              <stop offset="1" stopColor="#F97316" />
            </linearGradient>
          </defs>
          <path
            d="M13 38c7 9 22 10 32 2 5-4 7-9 6-16-8 3-13 8-16 15-4-10-11-16-22-18 2 8 6 14 13 18-4 2-9 2-13-1Z"
            fill="url(#whaleLogoGradient)"
          />
          <path d="M16 43c11 7 26 6 36-4" fill="none" stroke="#E0F2FE" strokeLinecap="round" strokeWidth="3" />
          <path d="M24 20c8 3 14 9 17 18" fill="none" stroke="#E0F2FE" strokeLinecap="round" strokeWidth="3" opacity=".9" />
          <circle cx="48" cy="18" r="4" fill="#F97316" />
          <circle cx="48" cy="18" r="8" fill="none" stroke="#7DD3FC" strokeWidth="2" opacity=".7" />
        </svg>
      </div>
      {!compact ? (
        <div className="leading-tight">
          <div className="text-lg font-black tracking-tight text-slate-950 dark:text-white">深海鲸行</div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">DeepWhale Data</div>
        </div>
      ) : null}
    </div>
  );
}
