"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Scan } from "@/lib/types";

const PIPELINE_STEPS: { status: Scan["status"]; label: string }[] = [
  { status: "QUEUED", label: "Queued" },
  { status: "INITIALIZING", label: "Initializing browser" },
  { status: "LOADING_PAGE", label: "Loading page" },
  { status: "COLLECTING_DATA", label: "Collecting page data" },
  { status: "RUNNING_DETECTORS", label: "Running detectors" },
  { status: "AI_ANALYSIS", label: "AI validation" },
  { status: "PROCESSING_RESULTS", label: "Scoring and saving report" },
];

const TERMINAL_STATUSES = new Set(["COMPLETED", "PARTIALLY_COMPLETED", "FAILED"]);
const POLL_INTERVAL_MS = 2000;

export function ScanProgressPoller({
  workspaceId,
  scanId,
  initialStatus,
}: {
  workspaceId: string;
  scanId: string;
  initialStatus: Scan["status"];
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Scan["status"]>(initialStatus);
  const [currentStep, setCurrentStep] = useState<string | null>(null);

  useEffect(() => {
    if (TERMINAL_STATUSES.has(status)) return;

    const interval = setInterval(async () => {
      try {
        const result = await api.getScanStatus(workspaceId, scanId);
        setStatus(result.status);
        setCurrentStep(result.currentStep);
        if (TERMINAL_STATUSES.has(result.status)) {
          router.refresh();
        }
      } catch {
        // transient polling failure — just try again next tick
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [workspaceId, scanId, status, router]);

  if (TERMINAL_STATUSES.has(status)) return null;

  const activeIndex = PIPELINE_STEPS.findIndex((s) => s.status === status);

  return (
    <div className="relative overflow-hidden rounded-lg border border-signal/40 bg-surface p-6">
      <div className="pointer-events-none absolute inset-0 -z-0">
        <div className="h-full w-1/3 animate-sweep bg-gradient-to-r from-transparent via-signal-soft/60 to-transparent" />
      </div>
      <div className="relative z-10">
        <div className="mb-4 flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse-dot rounded-full bg-signal" />
          <p className="label-eyebrow text-signal-ink">Scan in progress</p>
        </div>
        <ol className="space-y-2">
          {PIPELINE_STEPS.map((step, i) => {
            const done = activeIndex > i;
            const active = activeIndex === i;
            return (
              <li key={step.status} className="flex items-center gap-3 text-sm">
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border font-mono text-[9px] ${
                    done
                      ? "border-signal bg-signal text-ink"
                      : active
                        ? "border-signal text-signal-ink"
                        : "border-line text-transparent"
                  }`}
                >
                  {done ? "✓" : ""}
                </span>
                <span className={active ? "font-medium text-ink" : done ? "text-ink-faint" : "text-ink-faint/50"}>
                  {step.label}
                </span>
                {active && currentStep && <span className="font-mono text-xs text-ink-faint">— {currentStep}</span>}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
