import sharp from "sharp";
import type { ChromaColor } from "@/lib/validators";

export const DEFAULT_TOLERANCE = 60;

function hexToRgb(hex: ChromaColor): [number, number, number] {
  if (hex === "#00FF00") return [0, 255, 0];
  return [255, 0, 255];
}

export interface ChromaKeyOptions {
  /** Euclidean RGB distance from the target color below which a pixel is considered "background". 0-441. */
  tolerance?: number;
  /** Apply a 1-pixel alpha shrink to reduce chroma fringe on character silhouettes. */
  defringe?: boolean;
}

/**
 * Replace pixels matching the chroma color with full transparency.
 * Returns a PNG buffer with an alpha channel.
 */
export async function chromaKeyToAlpha(
  pngBuffer: Buffer,
  chromaColor: ChromaColor,
  options: ChromaKeyOptions = {},
): Promise<Buffer> {
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const tol2 = tolerance * tolerance;
  const [tr, tg, tb] = hexToRgb(chromaColor);

  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.channels !== 4) {
    throw new Error(`Expected 4 channels (RGBA) after ensureAlpha, got ${info.channels}`);
  }

  const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]!;
    const g = pixels[i + 1]!;
    const b = pixels[i + 2]!;
    const dr = r - tr;
    const dg = g - tg;
    const db = b - tb;
    if (dr * dr + dg * dg + db * db <= tol2) {
      pixels[i + 3] = 0;
    }
  }

  if (options.defringe) {
    erodeAlpha(pixels, info.width, info.height);
  }

  return sharp(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength), {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Erode the alpha channel by 1 pixel: any pixel with a fully-transparent neighbor becomes transparent. */
function erodeAlpha(pixels: Uint8ClampedArray, width: number, height: number): void {
  const next = new Uint8ClampedArray(pixels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4 + 3;
      if (pixels[idx] === 0) continue;
      // Check 4-neighborhood
      const neighbors: number[] = [];
      if (x > 0) neighbors.push(pixels[idx - 4]!);
      if (x < width - 1) neighbors.push(pixels[idx + 4]!);
      if (y > 0) neighbors.push(pixels[idx - width * 4]!);
      if (y < height - 1) neighbors.push(pixels[idx + width * 4]!);
      if (neighbors.some((a) => a === 0)) {
        next[idx] = 0;
      }
    }
  }
  pixels.set(next);
}
