import path from "node:path";
import sharp from "sharp";
import { BoundingBox } from "@ui-quality/shared";

export interface AnnotationBox {
  box: BoundingBox;
  color: string; // any valid SVG color, e.g. "#ef4444"
  label?: string;
}

export interface AnnotatedCropOptions {
  paddingPx?: number;
  maxWidthPx?: number;
  maxHeightPx?: number;
  strokeWidthPx?: number;
}

const DEFAULT_OPTIONS: Required<AnnotatedCropOptions> = {
  paddingPx: 50,
  maxWidthPx: 900,
  maxHeightPx: 900,
  strokeWidthPx: 3,
};

/**
 * Crops the region covering ALL given boxes (with padding) out of a
 * full-page screenshot, then overlays a colored outline + label around
 * each one. Used specifically for candidates involving more than one
 * element (element-overlap: "here are the two boxes in question") where
 * a plain, unannotated crop would leave the model guessing which
 * elements the detector actually flagged among everything else visible
 * in the crop.
 *
 * Returns null on any failure (missing screenshot, degenerate region) —
 * callers should fall back to the plain crop or text-only context.
 */
export async function buildAnnotatedCrop(
  sourceScreenshotPath: string,
  boxes: AnnotationBox[],
  outDir: string,
  outName: string,
  options: AnnotatedCropOptions = {}
): Promise<string | null> {
  if (boxes.length === 0) return null;
  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    const image = sharp(sourceScreenshotPath);
    const metadata = await image.metadata();
    const sourceWidth = metadata.width ?? 0;
    const sourceHeight = metadata.height ?? 0;
    if (sourceWidth === 0 || sourceHeight === 0) return null;

    const unionLeft = Math.min(...boxes.map((b) => b.box.x)) - opts.paddingPx;
    const unionTop = Math.min(...boxes.map((b) => b.box.y)) - opts.paddingPx;
    const unionRight = Math.max(...boxes.map((b) => b.box.x + b.box.width)) + opts.paddingPx;
    const unionBottom = Math.max(...boxes.map((b) => b.box.y + b.box.height)) + opts.paddingPx;

    const left = Math.max(0, Math.floor(unionLeft));
    const top = Math.max(0, Math.floor(unionTop));
    const width = Math.min(Math.ceil(unionRight - unionLeft), opts.maxWidthPx, sourceWidth - left);
    const height = Math.min(Math.ceil(unionBottom - unionTop), opts.maxHeightPx, sourceHeight - top);
    if (width <= 0 || height <= 0) return null;

    const svgRects = boxes
      .map(({ box, color, label }) => {
        const rx = box.x - left;
        const ry = box.y - top;
        const rectSvg = `<rect x="${rx}" y="${ry}" width="${box.width}" height="${box.height}" fill="none" stroke="${color}" stroke-width="${opts.strokeWidthPx}" />`;
        const labelSvg = label
          ? `<text x="${rx}" y="${Math.max(12, ry - 4)}" fill="${color}" font-size="14" font-family="sans-serif" font-weight="bold">${escapeXml(
              label
            )}</text>`
          : "";
        return rectSvg + labelSvg;
      })
      .join("\n");

    const overlaySvg = Buffer.from(
      `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${svgRects}</svg>`
    );

    const outPath = path.join(outDir, outName);
    await sharp(sourceScreenshotPath)
      .extract({ left, top, width, height })
      .composite([{ input: overlaySvg, top: 0, left: 0 }])
      .png()
      .toFile(outPath);

    return outPath;
  } catch {
    return null;
  }
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
