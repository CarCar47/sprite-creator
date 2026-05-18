import { describe, it, expect } from "vitest";
import { getClientIp } from "./rateLimit";

describe("getClientIp", () => {
  it("returns the first comma-separated entry of x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" });
    expect(getClientIp(headers)).toBe("203.0.113.7");
  });

  it("trims whitespace from the first x-forwarded-for entry", () => {
    const headers = new Headers({ "x-forwarded-for": "   198.51.100.4   , 10.0.0.1" });
    expect(getClientIp(headers)).toBe("198.51.100.4");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const headers = new Headers({ "x-real-ip": "192.0.2.55" });
    expect(getClientIp(headers)).toBe("192.0.2.55");
  });

  it("prefers x-forwarded-for over x-real-ip when both are present", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.7",
      "x-real-ip": "198.51.100.99",
    });
    expect(getClientIp(headers)).toBe("203.0.113.7");
  });

  it("returns anonymous when no IP header is present", () => {
    const headers = new Headers();
    expect(getClientIp(headers)).toBe("anonymous");
  });
});
