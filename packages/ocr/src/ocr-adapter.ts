import path from "node:path";
import { createWorker, Worker } from "tesseract.js";
import { OcrResult, OcrTextRegion } from "./text-region";

export interface OcrAdapterOptions {
  /** Path to the directory containing `<lang>.traineddata.gz`. Defaults
   * to the @tesseract.js-data/eng package's bundled 4.0.0 data — this is
   * what lets OCR run fully offline. tesseract.js's own default behavior
   * is to fetch training data from a CDN (jsdelivr) at runtime, which
   * fails in network-restricted environments (this is exactly the
   * failure mode this project's own sandbox hit during development —
   * see README). Passing a local langPath avoids that entirely. */
  langPath?: string;
  cachePath?: string;
  language?: string;
}

/**
 * Per the Phase 2 spec: "Extracts text from screenshots only when DOM
 * text is insufficient, canvas/image text is suspected, or screenshots
 * disagree with DOM." No current detector invokes this by default —
 * everything in Phase 0/1 reads text from the DOM, which is free,
 * instant, and exactly accurate, whereas OCR is slow and has its own
 * error rate. This adapter exists as a real, working capability for the
 * specific future cases the spec calls out (canvas-rendered text,
 * text baked into a raster image/banner), not as something wired into
 * the default detector pipeline today.
 */
export class OcrAdapter {
  private worker: Worker | null = null;
  private readonly options: Required<OcrAdapterOptions>;

  constructor(options: OcrAdapterOptions = {}) {
    this.options = {
      langPath:
        options.langPath ??
        path.join(require.resolve("@tesseract.js-data/eng/package.json"), "..", "4.0.0"),
      cachePath: options.cachePath ?? "/tmp/ui-quality-ocr-cache",
      language: options.language ?? "eng",
    };
  }

  private async ensureWorker(): Promise<Worker> {
    if (this.worker) return this.worker;
    this.worker = await createWorker(this.options.language, 1, {
      langPath: this.options.langPath,
      cachePath: this.options.cachePath,
    });
    return this.worker;
  }

  /** Runs OCR against an image file (typically a crop, not a full-page
   * screenshot — smaller images are both faster and more accurate for
   * the kind of short UI-copy text this project cares about). */
  async recognize(imagePath: string): Promise<OcrResult> {
    const worker = await this.ensureWorker();
    const result = await worker.recognize(imagePath, {}, { blocks: true });

    const regions: OcrTextRegion[] = [];
    const blocks = result.data.blocks ?? [];
    for (const block of blocks) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const line of paragraph.lines ?? []) {
          const text = line.text.trim();
          if (!text) continue;
          regions.push({
            text,
            confidence: (line.confidence ?? 0) / 100,
            boundingBox: {
              x: line.bbox.x0,
              y: line.bbox.y0,
              width: line.bbox.x1 - line.bbox.x0,
              height: line.bbox.y1 - line.bbox.y0,
            },
          });
        }
      }
    }

    const fullText = result.data.text.trim();
    return { fullText, regions, isEmpty: fullText.length === 0 };
  }

  async close(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}
