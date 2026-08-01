import { IssueSummary } from "@/lib/types";

function scoreColor(score: number): string {
  if (score >= 85) return "text-green-700";
  if (score >= 60) return "text-yellow-700";
  return "text-red-700";
}

export function ScorePanel({ score, summary }: { score: number | null; summary: IssueSummary }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">UI Quality Score</p>
          <p className={`text-4xl font-bold ${score !== null ? scoreColor(score) : "text-gray-400"}`}>
            {score !== null ? `${score}/100` : "—"}
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <span className="rounded bg-red-100 px-3 py-1.5 font-medium text-critical">Critical: {summary.critical}</span>
          <span className="rounded bg-orange-100 px-3 py-1.5 font-medium text-high">High: {summary.high}</span>
          <span className="rounded bg-yellow-100 px-3 py-1.5 font-medium text-medium">Medium: {summary.medium}</span>
          <span className="rounded bg-gray-100 px-3 py-1.5 font-medium text-low">Low: {summary.low}</span>
        </div>
      </div>
    </div>
  );
}
