export function ProjectTrendsPanel({
  trends,
}: {
  trends: { scanId: string; createdAt: string; score: number | null; totalIssues: number }[];
}) {
  if (trends.length === 0) return null;

  return (
    <div className="viewfinder rounded-lg border border-line bg-surface p-6">
      <span className="vf-br" />
      <span className="vf-bl" />
      <p className="label-eyebrow mb-3">Score trend</p>
      <ul className="space-y-2 text-sm">
        {trends.slice(0, 8).map((t) => (
          <li key={t.scanId} className="flex justify-between font-mono text-xs text-ink-faint">
            <span>{new Date(t.createdAt).toLocaleDateString()}</span>
            <span>
              {t.score ?? "—"}/100 · {t.totalIssues} issues
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
