import sharp from "sharp";
import type { ChromaColor } from "@/lib/validators";

export const DEFAULT_TOLERANCE = 60;

function hexToRgb(hex: ChromaColor | string): [number, number, number] {
  if (hex === "#00FF00") return [0, 255, 0];
  if (hex === "#FF00FF") return [255, 0, 255];
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

export interface ChromaKeyOptions {
  /** Euclidean RGB distance from the target color below which a pixel is considered "background". 0-441. */
  tolerance?: number;
  /** Apply alpha erosion to reduce chroma fringe on character silhouettes. Number of pixels to shrink. */
  defringe?: boolean | number;
}

/**
 * Replace pixels matching the chroma color with full transparency.
 * Returns a PNG buffer with an alpha channel.
 */
export async function chromaKeyToAlpha(
  pngBuffer: Buffer,
  chromaColor: ChromaColor | string,
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

  const erodePasses =
    options.defringe === true ? 1 : typeof options.defringe === "number" ? options.defringe : 0;
  for (let p = 0; p < erodePasses; p++) {
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

/**
 * Sample the four corners of an image and return the average color. Useful when the chroma
 * background color in the prompt was ignored by the model — we can detect the actual rendered
 * background and key on that instead.
 */
export async function detectBackgroundColor(
  pngBuffer: Buffer,
  sampleRadius = 8,
): Promise<{ hex: string; rgb: [number, number, number] }> {
  const { data, info } = await sharp(pngBuffer).removeAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
  if (info.channels !== 3) {
    throw new Error(`Expected 3 channels (RGB), got ${info.channels}`);
  }

  const corners: Array<[number, number]> = [
    [0, 0],
    [info.width - 1, 0],
    [0, info.height - 1],
    [info.width - 1, info.height - 1],
  ];

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let count = 0;

  for (const [cx, cy] of corners) {
    const x0 = Math.max(0, cx - sampleRadius);
    const x1 = Math.min(info.width - 1, cx + sampleRadius);
    const y0 = Math.max(0, cy - sampleRadius);
    const y1 = Math.min(info.height - 1, cy + sampleRadius);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const offset = (y * info.width + x) * 3;
        rSum += data[offset]!;
        gSum += data[offset + 1]!;
        bSum += data[offset + 2]!;
        count++;
      }
    }
  }

  const r = Math.round(rSum / count);
  const g = Math.round(gSum / count);
  const b = Math.round(bSum / count);
  const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  return { hex, rgb: [r, g, b] };
}

/**
 * Adaptive background removal: detects the actual background color from image corners
 * (handles cases where the model ignored our chroma-key prompt), then keys with a wider
 * tolerance and applies alpha erosion to clean the silhouette halo.
 *
 * This is the runtime path for Phase 1.6+ — replaces the static-chroma approach because
 * free image models do not reliably honor "render a solid #00FF00 background" prompts.
 */
export async function adaptiveBackgroundKey(
  pngBuffer: Buffer,
  hintedColor?: ChromaColor | string,
  options: { tolerance?: number; defringe?: number } = {},
): Promise<Buffer> {
  const detected = await detectBackgroundColor(pngBuffer);
  const useHint = hintedColor && colorDistance(detected.rgb, hexToRgb(hintedColor)) < 80;
  const keyColor = useHint && hintedColor ? hintedColor : detected.hex;
  return chromaKeyToAlpha(pngBuffer, keyColor, {
    tolerance: options.tolerance ?? 100,
    defringe: options.defringe ?? 2,
  });
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}
