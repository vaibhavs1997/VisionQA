import { PageContext, IssueCandidate } from "@ui-quality/shared";
import { AiProvider, AiValidationRequest } from "./types";
import { validateAiResponse } from "./schemas/ai-validation.schema";
import { buildCrop } from "./visual/crop-builder";
import { buildAnnotatedCrop } from "./visual/annotation-builder";
import { buildContextPack } from "./visual/context-pack-builder";
import { redactObjectDeep } from "./redaction";
import { AiCostTracker } from "./cost-tracker";
import { VALIDATE_PROMPT_VERSION } from "./prompts/validate-visual-issue.prompt";

export interface AiEnhanceOptions {
  provider: AiProvider;
  costTracker: AiCostTracker;
  /** Full-page screenshot for the SAME viewport as the PageContext passed
   * to enhanceWithAi — this function is called once per viewport, same
   * as the rest of the per-viewport pipeline in the CLI's scan command. */
  viewportScreenshotPath?: string;
  cropOutDir: string;
}

/**
 * Per Phase 2 scope: "AI runs only for ambiguous or high-value candidate
 * issues, not every page element." Each type below is one the
 * deterministic layer can only partially resolve on its own — the
 * detector itself either says so directly in its own comments, or (for
 * low-contrast-borderline) exists specifically because the deterministic
 * check can't tell a near-miss from a real failure:
 *  - element-overlap: explicitly called out in the spec's own Detectors
 *    table ("AI judges whether measured overlap is visually harmful").
 *  - broken-svg-icon: the icon-font-class case is a deliberately lower-
 *    confidence guess (see the detector's own comments).
 *  - unexpected-disabled-cta: "unexpected" is inherently a judgment call
 *    the detector itself flags as its riskiest false-positive surface.
 *  - low-contrast-borderline: contrast ratios within 0.3 of the WCAG
 *    threshold — genuinely too close to call without looking at the
 *    actual rendered crop (anti-aliasing, sub-pixel color blending, and
 *    background-color-resolution noise all live in this band).
 *  - empty-component, class-pattern bucket only (confidence < 0.75, i.e.
 *    NOT the higher-confidence heading/button-tag bucket): a "card"/
 *    "widget"-classed empty container might be a genuine loading bug, or
 *    might be a legitimate empty-state/ad-slot/skeleton placeholder —
 *    only a look at the actual render can tell those apart.
 *  - placeholder-generic-token: generic tokens like "TODO" or "sample
 *    text" are real placeholder markers in some copy and completely
 *    legitimate words in others (a support page literally explaining
 *    "how to file a TODO ticket") — AI reviews the surrounding text and
 *    render together rather than trusting the keyword match alone.
 */
function isAiEligible(candidate: IssueCandidate): boolean {
  if (candidate.issueType === "element-overlap") return true;
  if (candidate.issueType === "broken-svg-icon" && candidate.confidence < 0.75) return true;
  if (candidate.issueType === "unexpected-disabled-cta") return true;
  if (candidate.issueType === "low-contrast-borderline") return true;
  if (candidate.issueType === "empty-component" && candidate.confidence < 0.75) return true;
  if (candidate.issueType === "placeholder-generic-token") return true;
  return false;
}

function findOtherElement(context: PageContext, candidate: IssueCandidate) {
  const otherSelector = (candidate.evidence.raw as Record<string, unknown> | undefined)?.otherSelector;
  if (typeof otherSelector !== "string") return undefined;
  return context.elements.find((el) => el.selector === otherSelector);
}

async function buildRequest(
  context: PageContext,
  candidate: IssueCandidate,
  viewportScreenshotPath: string | undefined,
  cropOutDir: string
): Promise<AiValidationRequest | null> {
  if (!candidate.element?.boundingBox) return null;

  const contextPack = buildContextPack(context, candidate);
  const { value: redactedDomContext } = redactObjectDeep(contextPack.domContext);

  let cropPath: string | undefined;
  let annotatedCropPath: string | undefined;

  if (viewportScreenshotPath) {
    const safeName = candidate.rootCauseSignature?.replace(/[^a-zA-Z0-9_-]/g, "_") ?? `${candidate.issueType}_${Date.now()}`;

    const otherElement = findOtherElement(context, candidate);
    if (otherElement?.boundingBox) {
      // Two elements in play (element-overlap) — annotate both so the
      // model isn't left guessing which pair the detector meant among
      // whatever else is visible in the crop.
      annotatedCropPath =
        (await buildAnnotatedCrop(
          viewportScreenshotPath,
          [
            { box: candidate.element.boundingBox, color: "#ef4444", label: "A" },
            { box: otherElement.boundingBox, color: "#3b82f6", label: "B" },
          ],
          cropOutDir,
          `${safeName}_annotated.png`
        )) ?? undefined;
    } else {
      cropPath =
        (await buildCrop(viewportScreenshotPath, candidate.element.boundingBox, cropOutDir, `${safeName}_crop.png`)) ??
        undefined;
    }
  }

  return {
    candidateIssue: candidate,
    viewport: context.scan.viewport,
    screenshot: { fullPagePath: viewportScreenshotPath, cropPath, annotatedCropPath },
    domContext: redactedDomContext,
    instructionMode: "validate",
  };
}

/**
 * Runs AI validation over the eligible subset of deduplicated candidates
 * and returns a new candidate list with suppressions removed and
 * confirmations/explanations merged in. Never mutates its input.
 *
 * This is deliberately the ONLY place AI touches the pipeline — the
 * detectors, validator, and deduplicator upstream are completely
 * unaware AI exists, per the "AI adapter can be switched without
 * changing detector code" acceptance criterion (switching providers, or
 * disabling AI outright, only ever touches this function's caller).
 */
export async function enhanceWithAi(
  candidates: IssueCandidate[],
  context: PageContext,
  options: AiEnhanceOptions
): Promise<IssueCandidate[]> {
  const result: IssueCandidate[] = [];

  for (const candidate of candidates) {
    if (!isAiEligible(candidate)) {
      result.push(candidate);
      continue;
    }

    const viewportScreenshotPath = options.viewportScreenshotPath;
    const request = await buildRequest(context, candidate, viewportScreenshotPath, options.cropOutDir);

    if (!request) {
      // No usable element/bounding box to build a request from — leave
      // the deterministic candidate exactly as-is rather than force a
      // meaningless AI call.
      result.push(candidate);
      continue;
    }

    const { raw, call } = await options.provider.validate(request);
    options.costTracker.recordCall(call);

    if (!call.succeeded) {
      result.push(candidate); // provider/network failure — fail open to the deterministic result
      continue;
    }

    const validation = validateAiResponse(raw);
    if (!validation.valid || !validation.response) {
      options.costTracker.recordCall({ ...call, schemaValidationFailed: true });
      result.push(candidate); // malformed/unsupported AI claim — never let it influence the report
      continue;
    }

    const response = validation.response;
    options.costTracker.recordDecision(candidate.issueType, response.decision);

    const auditRecord = {
      provider: options.provider.name,
      model: options.provider.model,
      decision: response.decision,
      aiConfidence: response.confidence,
      evidenceSummary: response.evidenceSummary,
      cropPath: request.screenshot.annotatedCropPath ?? request.screenshot.cropPath,
      promptVersion: VALIDATE_PROMPT_VERSION,
    };

    if (response.decision === "suppress") {
      continue; // dropped from the report entirely
    }

    if (response.decision === "confirm") {
      result.push({
        ...candidate,
        severity: response.severityHint ?? candidate.severity,
        aiExplanation: response.explanation,
        suggestedFix: response.suggestedFix ?? candidate.suggestedFix,
        aiValidation: auditRecord,
      });
      continue;
    }

    // needs_more_evidence: kept, but demoted and clearly tagged as
    // unresolved rather than silently reported at full confidence.
    result.push({
      ...candidate,
      confidence: Math.min(candidate.confidence, candidate.confidence * 0.75),
      aiValidation: auditRecord,
    });
  }

  return result;
}
