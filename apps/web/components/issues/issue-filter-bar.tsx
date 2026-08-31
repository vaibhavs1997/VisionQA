"use client";

import { useRouter, useSearchParams } from "next/navigation";

const SEVERITIES = ["critical", "high", "medium", "low"];
const CATEGORIES = ["image", "network", "layout", "content", "accessibility", "technical", "seo"];

const SELECT_CLASS =
  "rounded border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-signal focus:outline-none";

export function IssueFilterBar() {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <span className="label-eyebrow">Filter</span>
      <select value={searchParams.get("severity") ?? ""} onChange={(e) => updateFilter("severity", e.target.value)} className={SELECT_CLASS}>
        <option value="">All severities</option>
        {SEVERITIES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select value={searchParams.get("category") ?? ""} onChange={(e) => updateFilter("category", e.target.value)} className={SELECT_CLASS}>
        <option value="">All categories</option>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <select value={searchParams.get("viewport") ?? ""} onChange={(e) => updateFilter("viewport", e.target.value)} className={SELECT_CLASS}>
        <option value="">All viewports</option>
        <option value="desktop">Desktop</option>
        <option value="tablet">Tablet</option>
        <option value="mobile">Mobile</option>
      </select>
    </div>
  );
}
