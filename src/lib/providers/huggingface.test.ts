import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { huggingface } from "./huggingface";

describe("huggingface provider metadata", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.HF_TOKEN;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("is unavailable without HF_TOKEN", () => {
    expect(huggingface.isAvailable()).toBe(false);
    expect(huggingface.whyUnavailable()).toMatch(/HF_TOKEN/);
  });

  it("becomes available when HF_TOKEN is set", () => {
    process.env.HF_TOKEN = "hf_test";
    expect(huggingface.isAvailable()).toBe(true);
    expect(huggingface.whyUnavailable()).toBeNull();
  });

  it("does not claim reference image support", () => {
    expect(huggingface.supportsReference).toBe(false);
  });

  it("declares FLUX.1-schnell as its model", () => {
    expect(huggingface.modelLabel).toBe("black-forest-labs/FLUX.1-schnell");
  });
});
