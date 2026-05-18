import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GET } from "./route";

describe("/api/health", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns ok with hasGeminiKey false when key is absent", async () => {
    delete process.env.GEMINI_API_KEY;
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.hasGeminiKey).toBe(false);
  });

  it("returns hasGeminiKey true when key is present", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const res = await GET();
    const body = await res.json();
    expect(body.hasGeminiKey).toBe(true);
  });

  it("reports the configured model", async () => {
    process.env.GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image-preview";
    const res = await GET();
    const body = await res.json();
    expect(body.model).toBe("gemini-3.1-flash-image-preview");
  });

  it("sets Cache-Control no-store", async () => {
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
