#!/usr/bin/env node
import { Command } from "commander";
import { runScanCommand } from "./commands/scan";
import { printConsoleSummary } from "./formatters/console-summary";
import { ScannerNetworkPolicyError } from "@ui-quality/scanner-core";

const program = new Command();

program
  .name("ui-scan")
  .description(
    "Phase 0-2 UI quality scanner — renders a public URL, runs deterministic UI detectors " +
      "(optionally enhanced by AI validation for the most ambiguous ones), and writes a " +
      "report.json + report.html + screenshots/evidence to --out."
  )
  .argument("<url>", "Public URL to scan (http/https only)")
  .option(
    "--viewports <list>",
    "Comma-separated viewports: desktop,tablet,mobile",
    "desktop,mobile"
  )
  .option("--out <dir>", "Output directory for report.json, screenshots, evidence", "./scan-output")
  .option("--timeout <ms>", "Navigation timeout in milliseconds per viewport", "30000")
  .option(
    "--ai <mode>",
    "AI validation mode: off (default, no cost/no key needed), mock (offline deterministic " +
      "heuristic provider, for testing the pipeline), or anthropic (real vision-LLM calls, " +
      "requires ANTHROPIC_API_KEY)",
    "off"
  )
  .action(async (url: string, opts: { viewports: string; out: string; timeout: string; ai: string }) => {
    const viewports = opts.viewports.split(",").map((v) => v.trim());
    const navigationTimeoutMs = Number.parseInt(opts.timeout, 10);
    const ai = opts.ai as "off" | "mock" | "anthropic";
    if (!["off", "mock", "anthropic"].includes(ai)) {
      console.error(`\nInvalid --ai value "${ai}". Must be one of: off, mock, anthropic.\n`);
      process.exit(1);
    }

    try {
      const { outDir, report } = await runScanCommand({
        url,
        viewports,
        outDir: opts.out,
        navigationTimeoutMs,
        ai,
      });
      printConsoleSummary(report, outDir);
      // Non-zero exit only for scan *execution* failure, never for
      // detected UI issues — per the Phase 0 spec for CLI Scan Command.
      process.exit(0);
    } catch (err) {
      if (err instanceof ScannerNetworkPolicyError) {
        console.error(`\nScan rejected by URL Security Guard: ${err.message}\nReason: ${err.reason}\n`);
      } else {
        console.error(`\nScan failed: ${err instanceof Error ? err.message : err}\n`);
      }
      process.exit(1);
    }
  });

program.parseAsync(process.argv);
