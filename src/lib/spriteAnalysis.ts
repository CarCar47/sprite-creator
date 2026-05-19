/**
 * Client-side analysis of an uploaded sprite sheet. Used by the importer's
 * "Auto-detect rows" button: scans the image's alpha channel to find horizontal
 * bands of non-transparent content (=rows of action frames) separated by bands
 * of transparency (=gutters between actions). Within each detected row, does
 * the same scan vertically to count distinct frame columns.
 *
 * Works in the browser only (uses OffscreenCanvas + ImageData).
 */

export interface DetectedRow {
  /** Top edge in image pixels (inclusive). */
  top: number;
  /** Bottom edge in image pixels (exclusive). */
  bottom: number;
  /** Detected number of frame columns within this row. */
  frameCount: number;
}

const OPAQUE_THRESHOLD = 16; // alpha > 16 counts as "content"
const MIN_CONTENT_RATIO = 0.005; // a row needs >0.5% opaque pixels to be considered content
const MIN_ROW_HEIGHT = 16; // ignore detected rows thinner than this (likely a separator artifact)
const MIN_FRAME_WIDTH = 16; // ignore detected frames narrower than this

interface ScanResult {
  bands: Array<{ start: number; end: number }>;
}

/**
 * Scan along one axis and group consecutive lines (rows or cols) whose opaque
 * pixel ratio meets the threshold. Returns the start/end of each contiguous band.
 */
function scanAxis(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  axis: "rows" | "cols",
  fromY = 0,
  toY = height,
  fromX = 0,
  toX = width,
): ScanResult {
  const totalLines = axis === "rows" ? toY - fromY : toX - fromX;
  const pixelsPerLine = axis === "rows" ? toX - fromX : toY - fromY;

  const opaqueRatios = new Float32Array(totalLines);
  for (let lineIdx = 0; lineIdx < totalLines; lineIdx++) {
    let opaqueCount = 0;
    for (let p = 0; p < pixelsPerLine; p++) {
      const x = axis === "rows" ? fromX + p : fromX + lineIdx;
      const y = axis === "rows" ? fromY + lineIdx : fromY + p;
      const alphaIdx = (y * width + x) * 4 + 3;
      if (data[alphaIdx]! > OPAQUE_THRESHOLD) opaqueCount++;
    }
    opaqueRatios[lineIdx] = opaqueCount / pixelsPerLine;
  }

  const bands: Array<{ start: number; end: number }> = [];
  let bandStart = -1;
  for (let i = 0; i < totalLines; i++) {
    const isContent = opaqueRatios[i]! >= MIN_CONTENT_RATIO;
    if (isContent && bandStart < 0) {
      bandStart = i;
    } else if (!isContent && bandStart >= 0) {
      bands.push({
        start: (axis === "rows" ? fromY : fromX) + bandStart,
        end: (axis === "rows" ? fromY : fromX) + i,
      });
      bandStart = -1;
    }
  }
  if (bandStart >= 0) {
    bands.push({
      start: (axis === "rows" ? fromY : fromX) + bandStart,
      end: (axis === "rows" ? fromY : fromX) + totalLines,
    });
  }
  return { bands };
}

async function getImageData(img: HTMLImageElement): Promise<{
  data: Uint8ClampedArray;
  width: number;
  height: number;
}> {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Browser did not return a 2D canvas context");
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, w, h);
  return { data: imageData.data, width: w, height: h };
}

/**
 * Detect rows of content in the image by scanning for horizontal bands of
 * opaque pixels separated by transparent gutters. For each row detected, also
 * count how many distinct frame columns it contains.
 *
 * Returns rows sorted top-to-bottom. Returns an empty array if the image is
 * fully opaque (no detectable gutters — fall back to user-specified grid).
 */
export async function detectRowsFromAlpha(img: HTMLImageElement): Promise<DetectedRow[]> {
  const { data, width, height } = await getImageData(img);

  // Scan all rows of pixels to find horizontal content bands.
  const { bands: rowBands } = scanAxis(data, width, height, "rows");
  const filteredRows = rowBands.filter((b) => b.end - b.start >= MIN_ROW_HEIGHT);

  if (filteredRows.length === 0) {
    return [];
  }

  // Within each row, scan columns to count frame regions.
  const detectedRows: DetectedRow[] = [];
  for (const row of filteredRows) {
    const { bands: colBands } = scanAxis(
      data,
      width,
      height,
      "cols",
      row.start,
      row.end,
      0,
      width,
    );
    const filteredCols = colBands.filter((b) => b.end - b.start >= MIN_FRAME_WIDTH);
    detectedRows.push({
      top: row.start,
      bottom: row.end,
      frameCount: Math.max(1, filteredCols.length),
    });
  }
  return detectedRows;
}

/**
 * If alpha detection finds nothing useful (e.g. opaque background), fall back
 * to dividing the image into N equal rows. Used as a graceful default when the
 * user hasn't drawn anything yet.
 */
export function fallbackEqualRows(
  height: number,
  rowCount: number,
  defaultFrameCount = 4,
): DetectedRow[] {
  const rowHeight = Math.floor(height / rowCount);
  const result: DetectedRow[] = [];
  for (let i = 0; i < rowCount; i++) {
    result.push({
      top: i * rowHeight,
      bottom: i === rowCount - 1 ? height : (i + 1) * rowHeight,
      frameCount: defaultFrameCount,
    });
  }
  return result;
}
