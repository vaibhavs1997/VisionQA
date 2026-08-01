"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Scan } from "@/lib/types";

const STEP_LABELS: Record<Scan["status"], string> = {
  QUEUED: "Queued",
  INITIALIZING: "Initializing browser",
  LOADING_PAGE: "Loading page",
  COLLECTING_DATA: "Collecting page data",
  RUNNING_DETECTORS: "Running detectors",
  AI_ANALYSIS: "AI validation",
  PROCESSING_RESULTS: "Scoring and saving report",
  COMPLETED: "Completed",
  PARTIALLY_COMPLETED: "Partially completed",
  FAILED: "Failed",
};

const TERMINAL_STATUSES = new Set(["COMPLETED", "PARTIALLY_COMPLETED", "FAILED"]);
const POLL_INTERVAL_MS = 2000;

export function ScanProgressPoller({ workspaceId, scanId, initialStatus }: { workspaceId: string; scanId: string; initialStatus: Scan["status"] }) {
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

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-6">
      <div className="flex items-center gap-3">
        <span className="h-3 w-3 animate-pulse rounded-full bg-blue-500" />
        <div>
          <p className="font-medium text-blue-900">{STEP_LABELS[status]}</p>
          {currentStep && <p className="text-sm text-blue-700">{currentStep}</p>}
        </div>
      </div>
    </div>
  );
}
