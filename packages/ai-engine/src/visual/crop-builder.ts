import path from "node:path";
import sharp from "sharp";
import { BoundingBox } from "@ui-quality/shared";

export interface CropOptions {
  /** Extra pixels of surrounding context on each side, so the model sees
   * the element in relation to its neighbors, not in total isolation. */
  paddingPx?: number;
  /** Hard ceiling on crop dimensions — protects against a pathologically
   * large bounding box (e.g. a near-full-page element) turning a "crop"
   * back into a full-page screenshot, defeating the point of cropping. */
  maxWidthPx?: number;
  maxHeightPx?: number;
}

const DEFAULT_OPTIONS: Required<CropOptions> = {
  paddingPx: 40,
  maxWidthPx: 900,
  maxHeightPx: 900,
};

/**
 * Crops a region around a bounding box out of a full-page (or viewport)
 * screenshot and writes it to outPath. This is the mechanism that keeps
 * AI payloads small and cheap — per the Phase 2 spec, we send crops, not
 * full-page screenshots, to the model by default.
 *
 * Returns null (rather than throwing) if the source screenshot is
 * missing or the crop would be degenerate (zero area) — callers should
 * treat that as "no visual evidence available" and fall back to a
 * text-only AI context rather than fail the whole scan.
 */
export async function buildCrop(
  sourceScreenshotPath: string,
  boundingBox: BoundingBox,
  outDir: string,
  outName: string,
  options: CropOptions = {}
): Promise<string | null> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    const image = sharp(sourceScreenshotPath);
    const metadata = await image.metadata();
    const sourceWidth = metadata.width ?? 0;
    const sourceHeight = metadata.height ?? 0;
    if (sourceWidth === 0 || sourceHeight === 0) return null;

    const rawLeft = boundingBox.x - opts.paddingPx;
    const rawTop = boundingBox.y - opts.paddingPx;
    const rawWidth = boundingBox.width + opts.paddingPx * 2;
    const rawHeight = boundingBox.height + opts.paddingPx * 2;

    const left = Math.max(0, Math.floor(rawLeft));
    const top = Math.max(0, Math.floor(rawTop));
    const width = Math.min(Math.ceil(rawWidth), opts.maxWidthPx, sourceWidth - left);
    const height = Math.min(Math.ceil(rawHeight), opts.maxHeightPx, sourceHeight - top);

    if (width <= 0 || height <= 0) return null;

    const outPath = path.join(outDir, outName);
    await sharp(sourceScreenshotPath).extract({ left, top, width, height }).png().toFile(outPath);
    return outPath;
  } catch {
    // Missing file, corrupt image, out-of-bounds extract, etc. — degrade
    // gracefully rather than let a screenshot problem fail AI validation
    // outright (the candidate can still be handled text-only).
    return null;
  }
}
