import { describe, it, expect } from "vitest";
import { buildPollinationsUrl, pollinations } from "./pollinations";

describe("buildPollinationsUrl", () => {
  it("URL-encodes the prompt", () => {
    const url = buildPollinationsUrl("a small green dragon");
    expect(url).toContain("a%20small%20green%20dragon");
  });

  it("includes default 1024x1024 dimensions for 1:1 1K", () => {
    const url = buildPollinationsUrl("test", { aspectRatio: "1:1", imageSize: "1K" });
    expect(url).toContain("width=1024");
    expect(url).toContain("height=1024");
  });

  it("uses 2048 base for 2K size", () => {
    const url = buildPollinationsUrl("test", { aspectRatio: "1:1", imageSize: "2K" });
    expect(url).toContain("width=2048");
    expect(url).toContain("height=2048");
  });

  it("uses different width/height for non-1:1 aspect ratios", () => {
    const url = buildPollinationsUrl("test", { aspectRatio: "16:9", imageSize: "1K" });
    expect(url).toContain("width=1024");
    expect(url).toContain("height=576");
  });

  it("includes nologo and private flags", () => {
    const url = buildPollinationsUrl("test");
    expect(url).toContain("nologo=true");
    expect(url).toContain("private=true");
  });

  it("includes seed when provided", () => {
    const url = buildPollinationsUrl("test", { seed: 42 });
    expect(url).toContain("seed=42");
  });
});

describe("pollinations provider metadata", () => {
  it("is always available", () => {
    expect(pollinations.isAvailable()).toBe(true);
    expect(pollinations.whyUnavailable()).toBeNull();
  });

  it("does not claim reference image support", () => {
    expect(pollinations.supportsReference).toBe(false);
  });
});
