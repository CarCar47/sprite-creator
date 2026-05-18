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

  it("returns status ok", async () => {
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
  });

  it("includes a providers summary with at least pollinations available", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.providers).toBeDefined();
    expect(body.providers.available).toContain("pollinations");
    expect(Array.isArray(body.providers.providers)).toBe(true);
  });

  it("reports hasUpstash true when KV vars are present, false when absent", async () => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    const noUpstash = await (await GET()).json();
    expect(noUpstash.hasUpstash).toBe(false);

    process.env.KV_REST_API_URL = "https://example.upstash.io";
    process.env.KV_REST_API_TOKEN = "token";
    const withUpstash = await (await GET()).json();
    expect(withUpstash.hasUpstash).toBe(true);
  });

  it("sets Cache-Control no-store", async () => {
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
