"use client";

import { useState } from "react";

export function ScreenshotViewer({ url, label }: { url?: string; label: string }) {
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-sm text-gray-400">
        Screenshot unavailable
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={`${label} screenshot`}
      className="w-full rounded-lg border border-gray-200"
      onError={() => setFailed(true)}
    />
  );
}
