import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getProvider,
  listAvailableProviderIds,
  pickDefaultProviderId,
  summarizeProviders,
} from "./registry";

describe("provider registry", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.HF_TOKEN;
    delete process.env.GEMINI_API_KEY;
    delete process.env.IMAGE_PROVIDER;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("getProvider returns each registered provider", () => {
    expect(getProvider("pollinations").id).toBe("pollinations");
    expect(getProvider("huggingface").id).toBe("huggingface");
    expect(getProvider("gemini").id).toBe("gemini");
  });

  it("pollinations is always available", () => {
    expect(listAvailableProviderIds()).toContain("pollinations");
  });

  it("huggingface is available only when HF_TOKEN is set", () => {
    expect(listAvailableProviderIds()).not.toContain("huggingface");
    process.env.HF_TOKEN = "hf_test";
    expect(listAvailableProviderIds()).toContain("huggingface");
  });

  it("gemini is available only when GEMINI_API_KEY is set", () => {
    expect(listAvailableProviderIds()).not.toContain("gemini");
    process.env.GEMINI_API_KEY = "test";
    expect(listAvailableProviderIds()).toContain("gemini");
  });

  it("picks huggingface as default when its token is set", () => {
    process.env.HF_TOKEN = "hf_test";
    expect(pickDefaultProviderId()).toBe("huggingface");
  });

  it("falls back to pollinations when no other providers are configured", () => {
    expect(pickDefaultProviderId()).toBe("pollinations");
  });

  it("honors IMAGE_PROVIDER env when the requested provider is available", () => {
    process.env.HF_TOKEN = "hf_test";
    process.env.IMAGE_PROVIDER = "pollinations";
    expect(pickDefaultProviderId()).toBe("pollinations");
  });

  it("ignores IMAGE_PROVIDER when the requested provider is unavailable", () => {
    process.env.IMAGE_PROVIDER = "gemini";
    expect(pickDefaultProviderId()).toBe("pollinations");
  });

  it("summarizeProviders returns the default and per-provider availability", () => {
    process.env.HF_TOKEN = "hf_test";
    const summary = summarizeProviders();
    expect(summary.default).toBe("huggingface");
    expect(summary.available).toEqual(expect.arrayContaining(["huggingface", "pollinations"]));
    const hf = summary.providers.find((p) => p.id === "huggingface");
    expect(hf?.available).toBe(true);
    const gem = summary.providers.find((p) => p.id === "gemini");
    expect(gem?.available).toBe(false);
    expect(gem?.whyUnavailable).toBeTruthy();
  });
});
