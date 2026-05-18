import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { chromaKeyToAlpha } from "./chromaKey";

async function makeHalfGreenHalfRedPng(): Promise<Buffer> {
  // 4x4 image: left half pure green (#00FF00), right half pure red (#FF0000).
  const width = 4;
  const height = 4;
  const channels = 3; // RGB
  const data = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * channels;
      if (x < width / 2) {
        data[offset] = 0;
        data[offset + 1] = 255;
        data[offset + 2] = 0;
      } else {
        data[offset] = 255;
        data[offset + 1] = 0;
        data[offset + 2] = 0;
      }
    }
  }
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

async function readPixels(
  png: Buffer,
): Promise<{ width: number; height: number; data: Buffer }> {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}

describe("chromaKeyToAlpha", () => {
  it("makes pure-green pixels transparent and leaves non-green pixels opaque", async () => {
    const input = await makeHalfGreenHalfRedPng();
    const output = await chromaKeyToAlpha(input, "#00FF00");
    const { width, height, data } = await readPixels(output);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (x < width / 2) {
          expect(alpha).toBe(0);
        } else {
          expect(alpha).toBe(255);
        }
      }
    }
  });

  it("preserves the original RGB values for non-keyed pixels", async () => {
    const input = await makeHalfGreenHalfRedPng();
    const output = await chromaKeyToAlpha(input, "#00FF00");
    const { width, data } = await readPixels(output);

    // Sample a red pixel (right half)
    const offset = (0 * width + 3) * 4;
    expect(data[offset]).toBe(255);
    expect(data[offset + 1]).toBe(0);
    expect(data[offset + 2]).toBe(0);
  });

  it("treats magenta chroma the same way (used for green-clothed characters)", async () => {
    const width = 2;
    const height = 1;
    const data = Buffer.from([255, 0, 255, 0, 0, 255]); // pixel 0 = magenta, pixel 1 = blue
    const input = await sharp(data, { raw: { width, height, channels: 3 } }).png().toBuffer();

    const output = await chromaKeyToAlpha(input, "#FF00FF");
    const { data: outData } = await readPixels(output);

    expect(outData[3]).toBe(0);
    expect(outData[7]).toBe(255);
  });

  it("respects the tolerance parameter for near-color pixels", async () => {
    const width = 2;
    const height = 1;
    // pixel 0 = exact green, pixel 1 = slightly off-green (10,250,10)
    const data = Buffer.from([0, 255, 0, 10, 250, 10]);
    const input = await sharp(data, { raw: { width, height, channels: 3 } }).png().toBuffer();

    // With tight tolerance, only the exact match becomes transparent.
    const tight = await chromaKeyToAlpha(input, "#00FF00", { tolerance: 5 });
    const tightPixels = await readPixels(tight);
    expect(tightPixels.data[3]).toBe(0);
    expect(tightPixels.data[7]).toBe(255);

    // With loose tolerance, both become transparent.
    const loose = await chromaKeyToAlpha(input, "#00FF00", { tolerance: 30 });
    const loosePixels = await readPixels(loose);
    expect(loosePixels.data[3]).toBe(0);
    expect(loosePixels.data[7]).toBe(0);
  });
});
