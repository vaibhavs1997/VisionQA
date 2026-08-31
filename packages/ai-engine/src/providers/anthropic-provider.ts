import fs from "node:fs";
import { requestWithPolicy, ScannerNetworkPolicy } from "@ui-quality/scanner-core";
import { AiProvider, AiValidationRequest, AiCallRecord } from "../types";
import { buildValidationPrompt, VALIDATE_PROMPT_VERSION } from "../prompts/validate-visual-issue.prompt";
import { buildExplainPrompt, EXPLAIN_PROMPT_VERSION } from "../prompts/explain-issue.prompt";

export interface AnthropicProviderOptions {
  apiKey?: string;
  model?: string;
  /** Approximate USD cost per 1K input/output tokens, for telemetry only.
   * Defaults are illustrative placeholders — set these from your actual
   * provider rate card; this tool never hardcodes billing-accurate figures. */
  costPerKInputTokensUsd?: number;
  costPerKOutputTokensUsd?: number;
  /** Allows scanner workers to share their centralized egress policy. */
  networkPolicy?: ScannerNetworkPolicy;
}

function readImageBase64(path: string): string {
  return fs.readFileSync(path).toString("base64");
}

/**
 * Calls the real Anthropic Messages API (api.anthropic.com) with a
 * cropped screenshot + strict prompt, and returns the raw text response
 * for the AiResponseValidator to schema-check one layer up. This
 * provider does zero response validation itself — "call the model,
 * return exactly what it said" is the whole job, by design (see
 * AiProvider interface).
 */
export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  readonly model: string;
  private readonly apiKey: string;
  private readonly costPerKInput: number;
  private readonly costPerKOutput: number;
  private readonly networkPolicy: ScannerNetworkPolicy;

  constructor(options: AnthropicProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "AnthropicProvider requires an API key. Set ANTHROPIC_API_KEY or pass { apiKey } explicitly."
      );
    }
    this.apiKey = apiKey;
    this.model = options.model ?? "claude-sonnet-5";
    this.costPerKInput = options.costPerKInputTokensUsd ?? 0.003;
    this.costPerKOutput = options.costPerKOutputTokensUsd ?? 0.015;
    this.networkPolicy = options.networkPolicy ?? new ScannerNetworkPolicy();
  }

  private async call(
    system: string,
    user: string,
    imagePath: string | undefined,
    kind: "validate" | "explain",
    issueType: string
  ): Promise<{ raw: unknown; call: AiCallRecord }> {
    const started = Date.now();

    const content: unknown[] = [];
    if (imagePath && fs.existsSync(imagePath)) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: "image/png", data: readImageBase64(imagePath) },
      });
    }
    content.push({ type: "text", text: user });

    let response: { status(): number; body(): Promise<Buffer> };
    try {
      response = await requestWithPolicy(this.networkPolicy, "https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 500,
          temperature: 0,
          system,
          messages: [{ role: "user", content }],
        }),
      });
    } catch (err) {
      return {
        raw: null,
        call: {
          requestKind: kind,
          issueType,
          provider: this.name,
          model: this.model,
          latencyMs: Date.now() - started,
          succeeded: false,
        },
      };
    }

    const latencyMs = Date.now() - started;
    if (response.status() < 200 || response.status() >= 300) {
      return {
        raw: null,
        call: { requestKind: kind, issueType, provider: this.name, model: this.model, latencyMs, succeeded: false },
      };
    }

    const data = JSON.parse((await response.body()).toString("utf-8")) as {
      content: Array<{ type: string; text?: string }>;
      usage?: { input_tokens: number; output_tokens: number };
    };
    const text = data.content.find((c) => c.type === "text")?.text ?? "";
    const inputTokens = data.usage?.input_tokens;
    const outputTokens = data.usage?.output_tokens;
    const estimatedCostUsd =
      inputTokens !== undefined && outputTokens !== undefined
        ? (inputTokens / 1000) * this.costPerKInput + (outputTokens / 1000) * this.costPerKOutput
        : undefined;

    return {
      raw: text,
      call: {
        requestKind: kind,
        issueType,
        provider: this.name,
        model: this.model,
        inputTokens,
        outputTokens,
        estimatedCostUsd,
        latencyMs,
        succeeded: true,
      },
    };
  }

  async validate(request: AiValidationRequest): Promise<{ raw: unknown; call: AiCallRecord }> {
    const { system, user } = buildValidationPrompt(request);
    void VALIDATE_PROMPT_VERSION;
    return this.call(system, user, request.screenshot.cropPath, "validate", request.candidateIssue.issueType);
  }

  async explain(request: AiValidationRequest): Promise<{ raw: unknown; call: AiCallRecord }> {
    const { system, user } = buildExplainPrompt(request);
    void EXPLAIN_PROMPT_VERSION;
    return this.call(system, user, request.screenshot.cropPath, "explain", request.candidateIssue.issueType);
  }
}
