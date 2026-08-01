import { randomUUID } from "node:crypto";
import { UiIssue, Viewport } from "@ui-quality/shared";
import { DeduplicatedCandidate } from "./deduplicator";

export interface AssembleContext {
  scanId: string;
  pageId: string;
  url: string;
  viewport: Viewport;
}

export function assembleIssues(
  deduplicated: DeduplicatedCandidate[],
  ctx: AssembleContext
): UiIssue[] {
  const createdAt = new Date().toISOString();

  return deduplicated.map(({ candidate, affectedElementCount }) => ({
    ...candidate,
    issueId: `iss_${randomUUID()}`,
    scanId: ctx.scanId,
    pageId: ctx.pageId,
    url: ctx.url,
    viewport: { name: ctx.viewport.name, width: ctx.viewport.width, height: ctx.viewport.height },
    browser: { engine: "chromium" },
    affectedElementCount,
    createdAt,
  }));
}
