import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  sliceGrid,
  findCommonAlphaBox,
  cropAllToBox,
  repackHorizontal,
  buildSpriteSheet,
} from "./spriteSheet";

/**
 * Build a 16x16 RGBA fixture as a 2x2 grid of 8x8 cells. Each cell has a single
 * opaque colored pixel at a different position so we can verify slice + bbox math.
 *  cell 0 (top-left):     opaque red pixel at (1,1) inside the cell
 *  cell 1 (top-right):    opaque green pixel at (2,2) inside the cell
 *  cell 2 (bottom-left):  opaque blue pixel at (3,3) inside the cell
 *  cell 3 (bottom-right): opaque white pixel at (4,4) inside the cell
 */
async function build2x2Fixture(): Promise<Buffer> {
  const size = 16;
  const cell = 8;
  const data = Buffer.alloc(size * size * 4); // all transparent

  const drawPixel = (cellCol: number, cellRow: number, x: number, y: number, rgb: [number, number, number]) => {
    const ax = cellCol * cell + x;
    const ay = cellRow * cell + y;
    const offset = (ay * size + ax) * 4;
    data[offset] = rgb[0];
    data[offset + 1] = rgb[1];
    data[offset + 2] = rgb[2];
    data[offset + 3] = 255;
  };

  drawPixel(0, 0, 1, 1, [255, 0, 0]);
  drawPixel(1, 0, 2, 2, [0, 255, 0]);
  drawPixel(0, 1, 3, 3, [0, 0, 255]);
  drawPixel(1, 1, 4, 4, [255, 255, 255]);

  return sharp(data, { raw: { width: size, height: size, channels: 4 } })
    .png()
    .toBuffer();
}

describe("sliceGrid", () => {
  it("slices a 2x2 grid into 4 cells of correct size", async () => {
    const fixture = await build2x2Fixture();
    const frames = await sliceGrid(fixture, 2, 2);
    expect(frames).toHaveLength(4);
    for (const frame of frames) {
      const meta = await sharp(frame.buffer).metadata();
      expect(meta.width).toBe(8);
      expect(meta.height).toBe(8);
    }
  });

  it("orders cells left-to-right then top-to-bottom (row-major)", async () => {
    const fixture = await build2x2Fixture();
    const frames = await sliceGrid(fixture, 2, 2);
    expect(frames[0]!.index).toBe(0);
    expect(frames[1]!.index).toBe(1);
    expect(frames[2]!.index).toBe(2);
    expect(frames[3]!.index).toBe(3);
  });

  it("throws when image dimensions are not divisible by the grid", async () => {
    const fixture = await build2x2Fixture(); // 16x16
    await expect(sliceGrid(fixture, 3, 3)).rejects.toThrow(/not evenly divisible/);
  });
});

describe("findCommonAlphaBox", () => {
  it("returns the union of every frame's alpha bounding box", async () => {
    const fixture = await build2x2Fixture();
    const frames = await sliceGrid(fixture, 2, 2);
    const box = await findCommonAlphaBox(frames);
    // Per-frame bboxes are at (1,1), (2,2), (3,3), (4,4) — each a single pixel.
    // Union: left=1, top=1, right=4, bottom=4 -> width=4, height=4
    expect(box).toEqual({ left: 1, top: 1, width: 4, height: 4 });
  });

  it("returns null when every frame is fully transparent", async () => {
    const size = 16;
    const empty = Buffer.alloc(size * size * 4);
    const blank = await sharp(empty, { raw: { width: size, height: size, channels: 4 } })
      .png()
      .toBuffer();
    const frames = await sliceGrid(blank, 2, 2);
    const box = await findCommonAlphaBox(frames);
    expect(box).toBeNull();
  });
});

describe("cropAllToBox", () => {
  it("crops every frame to the same dimensions", async () => {
    const fixture = await build2x2Fixture();
    const frames = await sliceGrid(fixture, 2, 2);
    const box = await findCommonAlphaBox(frames);
    expect(box).not.toBeNull();
    const cropped = await cropAllToBox(frames, box!, 0);
    for (const frame of cropped) {
      const meta = await sharp(frame.buffer).metadata();
      expect(meta.width).toBe(box!.width);
      expect(meta.height).toBe(box!.height);
    }
  });

  it("preserves frame indices through the crop pass", async () => {
    const fixture = await build2x2Fixture();
    const frames = await sliceGrid(fixture, 2, 2);
    const box = await findCommonAlphaBox(frames);
    const cropped = await cropAllToBox(frames, box!, 0);
    expect(cropped.map((f) => f.index)).toEqual([0, 1, 2, 3]);
  });
});

describe("repackHorizontal", () => {
  it("composites N frames into one wide strip of width=frameWidth*N", async () => {
    const fixture = await build2x2Fixture();
    const frames = await sliceGrid(fixture, 2, 2);
    const box = await findCommonAlphaBox(frames);
    const cropped = await cropAllToBox(frames, box!, 0);
    const strip = await repackHorizontal(cropped);
    const meta = await sharp(strip).metadata();
    expect(meta.width).toBe(box!.width * 4);
    expect(meta.height).toBe(box!.height);
  });

  it("orders frames by their index property", async () => {
    const fixture = await build2x2Fixture();
    const frames = await sliceGrid(fixture, 2, 2);
    const box = await findCommonAlphaBox(frames);
    const cropped = await cropAllToBox(frames, box!, 0);
    // Shuffle and verify repack still puts cell 0's pixel in the first frame slot.
    const shuffled = [cropped[3]!, cropped[1]!, cropped[2]!, cropped[0]!];
    const strip = await repackHorizontal(shuffled);
    const { data, info } = await sharp(strip).raw().toBuffer({ resolveWithObject: true });
    const channels = info.channels;
    // Cell 0 contained a red pixel at (1,1) within an 8x8 cell. After bbox crop with no padding
    // (box left=1, top=1), the red pixel is at (0,0) within a 4x4 frame. In the strip it should
    // appear at x=0, y=0.
    expect(data[0 * channels]).toBe(255); // R
    expect(data[0 * channels + 1]).toBe(0); // G
    expect(data[0 * channels + 2]).toBe(0); // B
  });
});

describe("buildSpriteSheet end-to-end", () => {
  it("produces a horizontal strip of the union-bbox frame size", async () => {
    const fixture = await build2x2Fixture();
    const { sheet, frameWidth, frameHeight, frameCount } = await buildSpriteSheet(
      fixture,
      2,
      2,
      0,
    );
    expect(frameCount).toBe(4);
    expect(frameWidth).toBe(4);
    expect(frameHeight).toBe(4);
    const meta = await sharp(sheet).metadata();
    expect(meta.width).toBe(frameWidth * frameCount);
    expect(meta.height).toBe(frameHeight);
  });
});
