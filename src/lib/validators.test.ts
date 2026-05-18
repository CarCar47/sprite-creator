import { describe, it, expect } from "vitest";
import { BaseRequestSchema, PPU_BY_STYLE } from "./validators";

describe("BaseRequestSchema", () => {
  const valid = {
    description: "a small green dragon with red eyes",
    style: "pixel32",
    chromaColor: "#00FF00",
  };

  it("accepts a minimal valid payload", () => {
    const result = BaseRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("defaults chromaColor to #00FF00 when omitted", () => {
    const { chromaColor: _omitted, ...withoutChroma } = valid;
    void _omitted;
    const result = BaseRequestSchema.safeParse(withoutChroma);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.chromaColor).toBe("#00FF00");
    }
  });

  it("trims leading and trailing whitespace from description", () => {
    const result = BaseRequestSchema.safeParse({
      ...valid,
      description: "   a small green dragon with red eyes   ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe("a small green dragon with red eyes");
    }
  });

  it("rejects descriptions shorter than 10 characters", () => {
    const result = BaseRequestSchema.safeParse({ ...valid, description: "tiny" });
    expect(result.success).toBe(false);
  });

  it("rejects descriptions longer than 500 characters", () => {
    const result = BaseRequestSchema.safeParse({
      ...valid,
      description: "x".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown style values", () => {
    const result = BaseRequestSchema.safeParse({ ...valid, style: "low-poly" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid chromaColor (must be #00FF00 or #FF00FF)", () => {
    const result = BaseRequestSchema.safeParse({ ...valid, chromaColor: "#123456" });
    expect(result.success).toBe(false);
  });

  it("accepts an optional palette of valid hex colors", () => {
    const result = BaseRequestSchema.safeParse({
      ...valid,
      palette: ["#FF0000", "#00FF00", "#0000FF"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects palette entries that are not 6-digit hex", () => {
    const result = BaseRequestSchema.safeParse({
      ...valid,
      palette: ["red"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a palette longer than 8 entries", () => {
    const result = BaseRequestSchema.safeParse({
      ...valid,
      palette: Array.from({ length: 9 }, (_, i) => `#${i.toString().padStart(6, "0")}`),
    });
    expect(result.success).toBe(false);
  });
});

describe("PPU_BY_STYLE", () => {
  it("maps each style to the documented Unity pixels-per-unit", () => {
    expect(PPU_BY_STYLE.pixel16).toBe(16);
    expect(PPU_BY_STYLE.pixel32).toBe(32);
    expect(PPU_BY_STYLE.cartoon).toBe(100);
    expect(PPU_BY_STYLE.modern).toBe(100);
  });
});
