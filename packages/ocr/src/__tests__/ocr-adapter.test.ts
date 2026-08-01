import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { OcrAdapter } from "../ocr-adapter";

// Real OCR run, not mocked — this test genuinely exercises tesseract.js
// end-to-end (worker startup, local language data, recognition) against
// a generated PNG. It's slower than a typical unit test (a few seconds
// for worker init) but the whole point of this adapter is that OCR
// actually works, so a mocked test would prove nothing.
describe("OcrAdapter (real OCR, no mocking)", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-test-"));
  const adapter = new OcrAdapter();

  afterAll(async () => {
    await adapter.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("recognizes rendered text in a generated image", async () => {
    const imagePath = path.join(tmpDir, "sample.png");
    await sharp({ create: { width: 320, height: 90, channels: 3, background: { r: 255, g: 255, b: 255 } } })
      .composite([
        {
          input: Buffer.from(
            `<svg width="320" height="90"><text x="10" y="55" font-size="32" fill="black">Save Changes</text></svg>`
          ),
          top: 0,
          left: 0,
        },
      ])
      .png()
      .toFile(imagePath);

    const result = await adapter.recognize(imagePath);
    expect(result.isEmpty).toBe(false);
    expect(result.fullText.toLowerCase()).toContain("save");
    expect(result.regions.length).toBeGreaterThan(0);
    expect(result.regions[0].confidence).toBeGreaterThan(0);
  }, 30_000);

  it("reports isEmpty for a blank image", async () => {
    const imagePath = path.join(tmpDir, "blank.png");
    await sharp({ create: { width: 200, height: 60, channels: 3, background: { r: 255, g: 255, b: 255 } } })
      .png()
      .toFile(imagePath);

    const result = await adapter.recognize(imagePath);
    expect(result.isEmpty).toBe(true);
  }, 30_000);
});
