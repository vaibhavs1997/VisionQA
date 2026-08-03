import { PageContext, IssueCandidate } from "@ui-quality/shared";

export type DataDependency =
  | "dom"
  | "images"
  | "network"
  | "console"
  | "screenshots"
  | "geometry"
  /** Data from actually interacting with the page (focusing elements,
   * pressing keys) rather than a single static snapshot — e.g.
   * `page.focusIndicatorChecks`. Distinct from "dom" so it's obvious at
   * a glance which detectors depend on the (more expensive, capped)
   * interaction-simulation pass. */
  | "interaction";

/**
 * Every detector — deterministic, computer-vision, OCR, or AI — implements
 * this interface. Detectors are pure functions over an already-assembled
 * PageContext: they never touch the browser directly. This is what makes
 * them independently unit-testable without a real browser (fixtures are
 * just PageContext JSON) and what lets new detectors be added by
 * registering a class, with zero changes to the orchestrator.
 */
export interface Detector {
  id: string;
  version: string;
  category: IssueCandidate["category"];
  /** Declares which parts of PageContext this detector actually reads,
   * so future phases can skip unneeded collection stages for cost. */
  requires: DataDependency[];
  run(context: PageContext): IssueCandidate[] | Promise<IssueCandidate[]>;
}
