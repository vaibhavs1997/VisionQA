export interface OcrTextRegion {
  text: string;
  confidence: number; // Tesseract's own 0-100 confidence, normalized to 0-1
  boundingBox: { x: number; y: number; width: number; height: number };
}

export interface OcrResult {
  fullText: string;
  regions: OcrTextRegion[];
  /** True if OCR ran but found no text at all — a meaningfully different
   * outcome from "OCR failed to run," which callers should distinguish. */
  isEmpty: boolean;
}
