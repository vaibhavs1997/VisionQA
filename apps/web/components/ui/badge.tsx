const SEVERITY_CLASSES: Record<string, string> = {
  critical: "bg-critical-soft text-critical-ink",
  high: "bg-high-soft text-high-ink",
  medium: "bg-medium-soft text-medium-ink",
  low: "bg-low-soft text-low-ink",
};

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wide ${
        SEVERITY_CLASSES[severity] ?? "bg-ink/10 text-ink-faint"
      }`}
    >
      {severity}
    </span>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "signal" | "warning";
}) {
  const toneClasses =
    tone === "signal"
      ? "bg-signal-soft text-signal-ink"
      : tone === "warning"
        ? "bg-medium-soft text-medium-ink"
        : "bg-ink/[0.05] text-ink-faint";

  return (
    <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium ${toneClasses}`}>
      {children}
    </span>
  );
}
