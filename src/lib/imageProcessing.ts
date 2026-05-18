import sharp from "sharp";

export interface BoundingBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Find the smallest axis-aligned bounding box that contains every non-transparent pixel.
 * Returns null if the image is entirely transparent.
 */
export async function findAlphaBoundingBox(pngBuffer: Buffer): Promise<BoundingBox | null> {
  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.channels !== 4) {
    throw new Error(`Expected 4 channels (RGBA), got ${info.channels}`);
  }

  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const alpha = data[(y * info.width + x) * 4 + 3]!;
      if (alpha > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0 || maxY < 0) return null;

  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

/**
 * Crop a PNG to the bounding box of its non-transparent pixels, with optional padding on all sides.
 * Padding pixels are added as fully-transparent background.
 */
export async function trimToAlphaBoundingBox(
  pngBuffer: Buffer,
  padding = 4,
): Promise<Buffer> {
  const box = await findAlphaBoundingBox(pngBuffer);
  if (!box) {
    return pngBuffer;
  }

  const meta = await sharp(pngBuffer).metadata();
  const totalWidth = meta.width ?? box.width;
  const totalHeight = meta.height ?? box.height;

  const padLeft = Math.min(padding, box.left);
  const padTop = Math.min(padding, box.top);
  const padRight = Math.min(padding, totalWidth - (box.left + box.width));
  const padBottom = Math.min(padding, totalHeight - (box.top + box.height));

  return sharp(pngBuffer)
    .extract({
      left: box.left - padLeft,
      top: box.top - padTop,
      width: box.width + padLeft + padRight,
      height: box.height + padTop + padBottom,
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export async function pngMetadata(buffer: Buffer): Promise<{ width: number; height: number }> {
  const meta = await sharp(buffer).metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0 };
}
