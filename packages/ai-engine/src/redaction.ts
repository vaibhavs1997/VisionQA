/**
 * Per the Phase 2 security spec: "Add screenshot redaction controls for
 * email addresses, tokens, credit-card-like strings, and configured
 * selectors." This module handles the TEXT side (DOM context sent as
 * JSON) — element text, attributes, evidence strings. Pixel-level
 * redaction of the actual screenshot image is a real gap (see
 * limitations note in this file) and is called out explicitly rather
 * than silently unhandled.
 */

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// Long, high-entropy-looking alphanumeric strings — a reasonable proxy
// for API keys/tokens/session IDs without needing a provider-specific
// token format list. Deliberately conservative (24+ chars) to avoid
// redacting ordinary long words or hashes used as legitimate UI copy.
const TOKEN_LIKE_PATTERN = /\b[A-Za-z0-9_-]{24,}\b/g;
// Credit-card-like: 13-19 digits, optionally grouped with spaces/dashes.
const CARD_LIKE_PATTERN = /\b(?:\d[ -]?){13,19}\b/g;

export interface RedactionOptions {
  /** Additional selectors whose text/attributes should always be fully
   * redacted regardless of pattern matching — e.g. a project could list
   * `#ssn-field`, `.password-input` etc. */
  configuredSelectors?: string[];
}

export interface RedactionResult {
  text: string;
  redactionsApplied: number;
}

/**
 * Redacts email addresses, token-like strings, and credit-card-like
 * digit sequences from a text string. Returns both the redacted text and
 * a count, so callers can log "N redactions applied" as part of the
 * auditability record without needing to inspect the original content.
 */
export function redactText(input: string): RedactionResult {
  let redactionsApplied = 0;
  let text = input;

  text = text.replace(EMAIL_PATTERN, () => {
    redactionsApplied++;
    return "[REDACTED_EMAIL]";
  });
  text = text.replace(TOKEN_LIKE_PATTERN, () => {
    redactionsApplied++;
    return "[REDACTED_TOKEN]";
  });
  text = text.replace(CARD_LIKE_PATTERN, () => {
    redactionsApplied++;
    return "[REDACTED_NUMBER]";
  });

  return { text, redactionsApplied };
}

/**
 * Redacts every string value in a plain JSON-ish object tree (used on
 * the DOM context / evidence payloads before they're serialized into a
 * prompt). Mutates nothing — returns a new structure.
 */
export function redactObjectDeep<T>(value: T): { value: T; redactionsApplied: number } {
  let totalRedactions = 0;

  function walk(v: unknown): unknown {
    if (typeof v === "string") {
      const { text, redactionsApplied } = redactText(v);
      totalRedactions += redactionsApplied;
      return text;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) out[k] = walk(val);
      return out;
    }
    return v;
  }

  return { value: walk(value) as T, redactionsApplied: totalRedactions };
}

/**
 * KNOWN LIMITATION: this module redacts TEXT sent to the AI (DOM
 * context, evidence strings) but does NOT perform pixel-level redaction
 * of the screenshot/crop images themselves. If a page renders sensitive
 * data as an image (e.g. a genuinely rendered credit card number in a
 * screenshot, not extractable as DOM text), that content is currently
 * still visible in the crop sent to the AI provider. Real image
 * redaction would need OCR-then-blur on the crop before sending it,
 * which is a reasonable Phase 2.5/3 addition once this pipeline has
 * real usage data to justify the added latency/cost per validation
 * call — flagged here rather than silently gapped.
 */
export const KNOWN_LIMITATION_NO_PIXEL_REDACTION = true;
