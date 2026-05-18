import { describe, it, expect } from "vitest";
import { buildManifest, shortPromptHash } from "./manifest";
import { DEFAULT_FPS_BY_ACTION } from "@/lib/prompts/actions";
import { PPU_BY_STYLE, FILTER_MODE_BY_STYLE } from "@/lib/validators";

describe("shortPromptHash", () => {
  it("returns a deterministic 16-char hex string", () => {
    const a = shortPromptHash("hello world");
    const b = shortPromptHash("hello world");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it("changes when the prompt changes", () => {
    const a = shortPromptHash("hello world");
    const b = shortPromptHash("hello world!");
    expect(a).not.toBe(b);
  });
});

describe("buildManifest", () => {
  const base = {
    frameCount: 4,
    frameWidth: 256,
    frameHeight: 256,
    action: "walk" as const,
    style: "pixel32" as const,
    provider: "huggingface" as const,
    modelVersion: "black-forest-labs/FLUX.1-schnell",
    prompt: "test prompt",
  };

  it("populates frame_count, frame_width, frame_height, columns=N, rows=1", () => {
    const m = buildManifest(base);
    expect(m.frame_count).toBe(4);
    expect(m.frame_width).toBe(256);
    expect(m.frame_height).toBe(256);
    expect(m.columns).toBe(4);
    expect(m.rows).toBe(1);
  });

  it("uses the per-action fps from DEFAULT_FPS_BY_ACTION", () => {
    expect(buildManifest({ ...base, action: "walk" }).fps).toBe(DEFAULT_FPS_BY_ACTION.walk);
    expect(buildManifest({ ...base, action: "run" }).fps).toBe(DEFAULT_FPS_BY_ACTION.run);
    expect(buildManifest({ ...base, action: "idle" }).fps).toBe(DEFAULT_FPS_BY_ACTION.idle);
    expect(buildManifest({ ...base, action: "death" }).fps).toBe(DEFAULT_FPS_BY_ACTION.death);
  });

  it("defaults pivot to center (0.5, 0.5)", () => {
    expect(buildManifest(base).pivot).toEqual({ x: 0.5, y: 0.5 });
  });

  it("uses PPU from PPU_BY_STYLE", () => {
    expect(buildManifest({ ...base, style: "pixel16" }).pixels_per_unit).toBe(PPU_BY_STYLE.pixel16);
    expect(buildManifest({ ...base, style: "pixel32" }).pixels_per_unit).toBe(PPU_BY_STYLE.pixel32);
    expect(buildManifest({ ...base, style: "cartoon" }).pixels_per_unit).toBe(PPU_BY_STYLE.cartoon);
    expect(buildManifest({ ...base, style: "modern" }).pixels_per_unit).toBe(PPU_BY_STYLE.modern);
  });

  it("emits filter_mode_hint Point for pixel styles, Bilinear for others", () => {
    expect(buildManifest({ ...base, style: "pixel16" }).filter_mode_hint).toBe(
      FILTER_MODE_BY_STYLE.pixel16,
    );
    expect(buildManifest({ ...base, style: "cartoon" }).filter_mode_hint).toBe(
      FILTER_MODE_BY_STYLE.cartoon,
    );
  });

  it("includes provider, action, style, model_version, generated_at, prompt_hash", () => {
    const m = buildManifest(base);
    expect(m.provider).toBe("huggingface");
    expect(m.action).toBe("walk");
    expect(m.style).toBe("pixel32");
    expect(m.model_version).toBe("black-forest-labs/FLUX.1-schnell");
    expect(m.prompt_hash).toMatch(/^[0-9a-f]{16}$/);
    expect(() => new Date(m.generated_at)).not.toThrow();
  });
});
