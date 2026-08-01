import { UiIssue, IssueSeverity } from "@ui-quality/shared";

const SEVERITY_ORDER: IssueSeverity[] = ["low", "medium", "high", "critical"];
const NARROW_VIEWPORTS = new Set(["mobile", "tablet"]);

function bumpSeverity(severity: IssueSeverity): IssueSeverity {
  const idx = SEVERITY_ORDER.indexOf(severity);
  // Deliberately capped below "critical" — that designation is reserved
  // for a detector's own direct judgment (e.g. a confirmed 404 asset),
  // not something cross-viewport recurrence alone should be able to
  // manufacture.
  if (idx === -1 || idx >= SEVERITY_ORDER.length - 2) return severity;
  return SEVERITY_ORDER[idx + 1];
}

function rootKey(issue: UiIssue): string {
  return issue.rootCauseSignature ?? `${issue.issueType}:${issue.element?.selector ?? issue.title}`;
}

/**
 * "Responsive delta issue" from the Phase 1 spec. Unlike every other
 * detector, this cannot be a single-PageContext plugin — it needs the
 * full set of issues collected across every viewport scanned, which is
 * only available after the CLI has looped over all viewports. So it
 * runs as a post-processing pass over the assembled UiIssue list, not
 * as an entry in the detector registry.
 *
 * Two things come out of it:
 *  1. Every issue gets a `responsiveRecurrence` tag: which viewports it
 *     was found in vs. which were scanned, and whether it's a
 *     narrow-viewport-only (mobile/tablet) regression — useful signal
 *     on its own even before touching severity.
 *  2. An issue whose root cause recurs identically across 2+ viewports
 *     is corroborated evidence of a persistent defect, not a one-off
 *     rendering fluke — its severity is bumped one level (capped below
 *     "critical", which stays a detector-only designation).
 */
export function applyResponsiveDelta(issues: UiIssue[], viewportsScanned: string[]): UiIssue[] {
  const groups = new Map<string, UiIssue[]>();
  for (const issue of issues) {
    const key = rootKey(issue);
    const list = groups.get(key) ?? [];
    list.push(issue);
    groups.set(key, list);
  }

  for (const group of groups.values()) {
    const viewportsAffected = [...new Set(group.map((i) => i.viewport.name))];
    const narrowViewportOnly =
      viewportsAffected.every((v) => NARROW_VIEWPORTS.has(v)) &&
      viewportsScanned.some((v) => !NARROW_VIEWPORTS.has(v));
    const recurs = viewportsAffected.length >= 2;

    for (const issue of group) {
      issue.responsiveRecurrence = { viewportsAffected, viewportsScanned, narrowViewportOnly };
      if (recurs) {
        issue.severity = bumpSeverity(issue.severity);
      }
    }
  }

  return issues;
}
