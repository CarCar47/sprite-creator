import sharp from "sharp";
import { findAlphaBoundingBox, type BoundingBox } from "@/lib/imageProcessing";

export interface SlicedFrame {
  /** Index in left-to-right then top-to-bottom order. */
  index: number;
  /** PNG buffer for this single frame. */
  buffer: Buffer;
}

/**
 * Slice a grid-laid-out PNG into N per-cell PNG buffers. Assumes every cell is the same
 * size: `imageWidth / cols` by `imageHeight / rows`. Throws if the input dimensions are
 * not evenly divisible.
 */
export async function sliceGrid(
  pngBuffer: Buffer,
  cols: number,
  rows: number,
): Promise<SlicedFrame[]> {
  if (cols <= 0 || rows <= 0) {
    throw new Error(`sliceGrid: cols/rows must be positive (got ${cols}x${rows})`);
  }

  const meta = await sharp(pngBuffer).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width % cols !== 0 || height % rows !== 0) {
    throw new Error(
      `sliceGrid: image ${width}x${height} not evenly divisible by ${cols}x${rows}`,
    );
  }

  const cellWidth = width / cols;
  const cellHeight = height / rows;

  const frames: SlicedFrame[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const left = col * cellWidth;
      const top = row * cellHeight;
      const buffer = await sharp(pngBuffer)
        .extract({ left, top, width: cellWidth, height: cellHeight })
        .png({ compressionLevel: 9 })
        .toBuffer();
      frames.push({ index: row * cols + col, buffer });
    }
  }
  return frames;
}

/**
 * Compute the smallest bounding box that contains every frame's non-transparent
 * region (i.e. union of per-frame alpha bounding boxes). Returns null if every frame
 * is fully transparent (degenerate case).
 */
export async function findCommonAlphaBox(
  frames: SlicedFrame[],
): Promise<BoundingBox | null> {
  let unionMinX = Infinity;
  let unionMinY = Infinity;
  let unionMaxX = -Infinity;
  let unionMaxY = -Infinity;

  for (const frame of frames) {
    const box = await findAlphaBoundingBox(frame.buffer);
    if (!box) continue;
    if (box.left < unionMinX) unionMinX = box.left;
    if (box.top < unionMinY) unionMinY = box.top;
    const r = box.left + box.width - 1;
    const b = box.top + box.height - 1;
    if (r > unionMaxX) unionMaxX = r;
    if (b > unionMaxY) unionMaxY = b;
  }

  if (!Number.isFinite(unionMinX) || !Number.isFinite(unionMaxX)) {
    return null;
  }

  return {
    left: unionMinX,
    top: unionMinY,
    width: unionMaxX - unionMinX + 1,
    height: unionMaxY - unionMinY + 1,
  };
}

/**
 * Crop every frame to the same bounding box (with optional uniform padding clamped at
 * the cell edges) and return new frame buffers, all of identical dimensions.
 */
export async function cropAllToBox(
  frames: SlicedFrame[],
  box: BoundingBox,
  padding = 4,
): Promise<SlicedFrame[]> {
  if (frames.length === 0) return [];
  const firstMeta = await sharp(frames[0]!.buffer).metadata();
  const cellWidth = firstMeta.width ?? box.width;
  const cellHeight = firstMeta.height ?? box.height;

  const padLeft = Math.min(padding, box.left);
  const padTop = Math.min(padding, box.top);
  const padRight = Math.min(padding, cellWidth - (box.left + box.width));
  const padBottom = Math.min(padding, cellHeight - (box.top + box.height));

  const finalLeft = box.left - padLeft;
  const finalTop = box.top - padTop;
  const finalWidth = box.width + padLeft + padRight;
  const finalHeight = box.height + padTop + padBottom;

  const cropped: SlicedFrame[] = [];
  for (const frame of frames) {
    const buf = await sharp(frame.buffer)
      .extract({ left: finalLeft, top: finalTop, width: finalWidth, height: finalHeight })
      .png({ compressionLevel: 9 })
      .toBuffer();
    cropped.push({ index: frame.index, buffer: buf });
  }
  return cropped;
}

/**
 * Composite N equally-sized frames left-to-right into a single horizontal sprite
 * strip. Result dimensions: (frame_width * N, frame_height). Unity Sprite Editor's
 * "Grid By Cell Count" with Columns=N, Rows=1 slices this cleanly.
 */
export async function repackHorizontal(frames: SlicedFrame[]): Promise<Buffer> {
  if (frames.length === 0) {
    throw new Error("repackHorizontal: cannot repack zero frames");
  }
  const firstMeta = await sharp(frames[0]!.buffer).metadata();
  const frameWidth = firstMeta.width ?? 0;
  const frameHeight = firstMeta.height ?? 0;
  if (frameWidth === 0 || frameHeight === 0) {
    throw new Error("repackHorizontal: frame metadata missing dimensions");
  }

  const totalWidth = frameWidth * frames.length;
  const sorted = [...frames].sort((a, b) => a.index - b.index);
  const composites = sorted.map((frame, i) => ({
    input: frame.buffer,
    left: i * frameWidth,
    top: 0,
  }));

  return sharp({
    create: {
      width: totalWidth,
      height: frameHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export type FrameQuality = "ok" | "low_alpha" | "high_alpha";

export interface BuiltSheet {
  sheet: Buffer;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  /** Per-frame quality flag based on alpha-pixel deviation from the median. */
  frameQuality: FrameQuality[];
}

/**
 * Count opaque pixels (alpha > 0) in a single PNG frame. Used by quality detection to
 * spot frames whose subject is much smaller (model failed to draw the character) or
 * much larger (model bled into the cell from neighbors) than typical.
 */
async function countOpaquePixels(pngBuffer: Buffer): Promise<number> {
  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let count = 0;
  for (let i = 3; i < data.length; i += info.channels) {
    if (data[i]! > 0) count++;
  }
  return count;
}

/**
 * Flag frames whose opaque-pixel count deviates more than ±50% from the median.
 * Returns a parallel array of FrameQuality flags.
 */
async function detectFrameQuality(frames: SlicedFrame[]): Promise<FrameQuality[]> {
  if (frames.length === 0) return [];
  const counts = await Promise.all(frames.map((f) => countOpaquePixels(f.buffer)));
  const sorted = [...counts].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  if (median === 0) {
    // Every frame empty — nothing meaningful to compare.
    return counts.map(() => "low_alpha" as FrameQuality);
  }
  const lower = median * 0.5;
  const upper = median * 1.5;
  return counts.map<FrameQuality>((c) => {
    if (c < lower) return "low_alpha";
    if (c > upper) return "high_alpha";
    return "ok";
  });
}

/**
 * End-to-end sprite-sheet build: slice the model's grid output, find the common alpha
 * box across every frame, uniform-crop every frame to that box, then repack horizontally.
 * Returns the final horizontal strip + the per-frame dimensions for the manifest.
 */
export async function buildSpriteSheet(
  grid: Buffer,
  cols: number,
  rows: number,
  padding = 4,
): Promise<BuiltSheet> {
  const frames = await sliceGrid(grid, cols, rows);
  return composeSpriteSheet(frames, padding);
}

/**
 * Compose a horizontal sprite-sheet strip from pre-separated frame buffers.
 *
 * Used by careful per-frame mode (Phase 2.12): instead of slicing a single grid image,
 * the route generates N independent images and feeds them here. Pipeline is otherwise
 * identical to buildSpriteSheet: find the union alpha bbox across every frame, uniform-crop
 * everything to that bbox, then repack horizontally.
 */
export async function composeSpriteSheet(
  frames: SlicedFrame[],
  padding = 4,
): Promise<BuiltSheet> {
  const box = await findCommonAlphaBox(frames);
  if (!box) {
    throw new Error("composeSpriteSheet: every frame was fully transparent");
  }
  const cropped = await cropAllToBox(frames, box, padding);
  const frameQuality = await detectFrameQuality(cropped);
  const sheet = await repackHorizontal(cropped);
  const firstMeta = await sharp(cropped[0]!.buffer).metadata();
  return {
    sheet,
    frameWidth: firstMeta.width ?? 0,
    frameHeight: firstMeta.height ?? 0,
    frameCount: cropped.length,
    frameQuality,
  };
}
