import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export interface RateLimitDecision {
  ok: boolean;
  retryAfterSeconds: number;
  scope: "minute" | "day" | "none";
  limit: number;
  remaining: number;
}

let _redis: Redis | null = null;
function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  _redis = new Redis({ url, token });
  return _redis;
}

let _perMinute: Ratelimit | null = null;
let _perDay: Ratelimit | null = null;

function perMinute(): Ratelimit | null {
  if (_perMinute) return _perMinute;
  const redis = getRedis();
  if (!redis) return null;
  _perMinute = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(6, "1 m"),
    prefix: "rl:1m",
    analytics: false,
  });
  return _perMinute;
}

function perDay(): Ratelimit | null {
  if (_perDay) return _perDay;
  const redis = getRedis();
  if (!redis) return null;
  _perDay = new Ratelimit({
    redis,
    limiter: Ratelimit.fixedWindow(60, "1 d"),
    prefix: "rl:1d",
    analytics: false,
  });
  return _perDay;
}

/**
 * Extract the client IP. Trusts the first comma-separated entry of x-forwarded-for
 * (Vercel sets this to the real client IP at the edge). Falls back to "anonymous"
 * for local dev where the header is absent.
 */
export function getClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers.get("x-real-ip");
  if (real?.trim()) return real.trim();
  return "anonymous";
}

/**
 * Check both per-minute and per-day rate limits for the given key.
 * If Upstash is not configured, fails open (returns ok: true) — useful for local dev.
 * In production the env vars are always present, so this only short-circuits in dev.
 */
export async function checkRateLimit(key: string): Promise<RateLimitDecision> {
  const minute = perMinute();
  const day = perDay();

  if (!minute || !day) {
    return { ok: true, retryAfterSeconds: 0, scope: "none", limit: 0, remaining: 0 };
  }

  try {
    const dayResult = await day.limit(key);
    if (!dayResult.success) {
      return {
        ok: false,
        retryAfterSeconds: Math.max(1, Math.ceil((dayResult.reset - Date.now()) / 1000)),
        scope: "day",
        limit: dayResult.limit,
        remaining: dayResult.remaining,
      };
    }

    const minuteResult = await minute.limit(key);
    if (!minuteResult.success) {
      return {
        ok: false,
        retryAfterSeconds: Math.max(1, Math.ceil((minuteResult.reset - Date.now()) / 1000)),
        scope: "minute",
        limit: minuteResult.limit,
        remaining: minuteResult.remaining,
      };
    }

    return {
      ok: true,
      retryAfterSeconds: 0,
      scope: "none",
      limit: minuteResult.limit,
      remaining: minuteResult.remaining,
    };
  } catch (err) {
    // Upstash Redis is unreachable or returned malformed data. Fail open rather than
    // crashing the function — the request still goes through, just unrate-limited
    // until the limiter recovers. Log for observability.
    console.warn(
      `[rateLimit] upstash error, failing open: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { ok: true, retryAfterSeconds: 0, scope: "none", limit: 0, remaining: 0 };
  }
}
