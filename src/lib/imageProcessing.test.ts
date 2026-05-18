import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  findAlphaBoundingBox,
  trimToAlphaBoundingBox,
  pngMetadata,
} from "./imageProcessing";

async function makeTransparentPngWithCenteredSquare(
  canvasSize: number,
  squareSize: number,
): Promise<Buffer> {
  const channels = 4;
  const data = Buffer.alloc(canvasSize * canvasSize * channels);
  // All transparent by default (alpha=0)
  const start = Math.floor((canvasSize - squareSize) / 2);
  const end = start + squareSize;
  for (let y = start; y < end; y++) {
    for (let x = start; x < end; x++) {
      const offset = (y * canvasSize + x) * channels;
      data[offset] = 255;
      data[offset + 1] = 0;
      data[offset + 2] = 0;
      data[offset + 3] = 255;
    }
  }
  return sharp(data, {
    raw: { width: canvasSize, height: canvasSize, channels: 4 },
  })
    .png()
    .toBuffer();
}

describe("findAlphaBoundingBox", () => {
  it("returns the tight bounding box around an opaque square in a transparent canvas", async () => {
    const png = await makeTransparentPngWithCenteredSquare(16, 4);
    const box = await findAlphaBoundingBox(png);
    expect(box).toEqual({ left: 6, top: 6, width: 4, height: 4 });
  });

  it("returns null for a fully transparent image", async () => {
    const width = 8;
    const height = 8;
    const data = Buffer.alloc(width * height * 4); // all zeros
    const png = await sharp(data, { raw: { width, height, channels: 4 } })
      .png()
      .toBuffer();
    const box = await findAlphaBoundingBox(png);
    expect(box).toBeNull();
  });
});

describe("trimToAlphaBoundingBox", () => {
  it("crops down to the alpha bounding box plus padding", async () => {
    const png = await makeTransparentPngWithCenteredSquare(32, 8);
    const trimmed = await trimToAlphaBoundingBox(png, 4);
    const meta = await pngMetadata(trimmed);
    // square is 8x8, padding 4 on each side => 16x16
    expect(meta.width).toBe(16);
    expect(meta.height).toBe(16);
  });

  it("returns the original buffer when the image is entirely transparent", async () => {
    const width = 4;
    const height = 4;
    const data = Buffer.alloc(width * height * 4);
    const png = await sharp(data, { raw: { width, height, channels: 4 } })
      .png()
      .toBuffer();
    const trimmed = await trimToAlphaBoundingBox(png);
    expect(trimmed).toBe(png);
  });

  it("clamps padding when the bounding box already sits at the edge", async () => {
    // 8x8 canvas with an opaque square at the top-left 4x4
    const canvas = 8;
    const data = Buffer.alloc(canvas * canvas * 4);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const o = (y * canvas + x) * 4;
        data[o] = 255;
        data[o + 3] = 255;
      }
    }
    const png = await sharp(data, { raw: { width: canvas, height: canvas, channels: 4 } })
      .png()
      .toBuffer();
    const trimmed = await trimToAlphaBoundingBox(png, 4);
    const meta = await pngMetadata(trimmed);
    // Available padding is 0 on top/left, 4 on right/bottom: final = 4 + 0 + 4 = 8
    expect(meta.width).toBe(8);
    expect(meta.height).toBe(8);
  });
});
