import fs from "node:fs";
import path from "node:path";

export function loadEnvFile(): void {
  const envPath = path.resolve(__dirname, "..", "..", "..", ".env");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath).toString("utf8").replace(/^\uFEFF/, "");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
