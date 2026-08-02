"use client";

import { useState } from "react";

export function ScreenshotViewer({ url, label }: { url?: string; label: string }) {
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-line-strong bg-paper font-mono text-xs text-ink-faint">
        Screenshot unavailable
      </div>
    );
  }

  return (
    <div className="viewfinder text-line-strong">
      <span className="vf-br" />
      <span className="vf-bl" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={`${label} screenshot`}
        className="w-full rounded-lg border border-line"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
