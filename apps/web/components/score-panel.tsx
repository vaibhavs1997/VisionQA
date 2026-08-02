import { IssueSummary } from "@/lib/types";

function scoreTone(score: number): { text: string; ring: string } {
  if (score >= 85) return { text: "text-signal-ink", ring: "text-signal" };
  if (score >= 60) return { text: "text-medium-ink", ring: "text-medium" };
  return { text: "text-critical-ink", ring: "text-critical" };
}

const STAT_ITEMS: { key: keyof IssueSummary; label: string; barClass: string }[] = [
  { key: "critical", label: "Critical", barClass: "bg-critical" },
  { key: "high", label: "High", barClass: "bg-high" },
  { key: "medium", label: "Medium", barClass: "bg-medium" },
  { key: "low", label: "Low", barClass: "bg-low" },
];

export function ScorePanel({ score, summary }: { score: number | null; summary: IssueSummary }) {
  const tone = score !== null ? scoreTone(score) : { text: "text-ink-faint", ring: "text-line-strong" };

  return (
    <div className={`viewfinder rounded-lg border border-line bg-surface p-6 shadow-panel ${tone.ring}`}>
      <span className="vf-br" />
      <span className="vf-bl" />
      <div className="flex flex-col gap-6 text-ink sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="label-eyebrow mb-1">UI quality score</p>
          <p className={`font-mono text-5xl font-bold tabular-nums ${tone.text}`}>
            {score !== null ? score : "—"}
            <span className="text-xl font-normal text-ink-faint">/100</span>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STAT_ITEMS.map((item) => (
            <div key={item.key} className="rounded border border-line bg-paper px-3 py-2">
              <div className="mb-1 flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${item.barClass}`} />
                <span className="label-eyebrow">{item.label}</span>
              </div>
              <p className="font-mono text-lg font-semibold text-ink">{summary[item.key]}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
