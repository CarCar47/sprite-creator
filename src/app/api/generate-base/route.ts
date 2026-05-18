import { NextResponse, type NextRequest } from "next/server";
import { BaseRequestSchema, PPU_BY_STYLE } from "@/lib/validators";
import type { BaseResponse } from "@/lib/validators";
import { buildBasePromptFromRequest } from "@/lib/prompts/baseCharacter";
import { getProvider, pickDefaultProviderId } from "@/lib/providers/registry";
import { ProviderError } from "@/lib/providers/types";
import { removeBackground } from "@/lib/backgroundRemoval";
import { trimToAlphaBoundingBox, pngMetadata } from "@/lib/imageProcessing";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOFT_TIMEOUT_MS = 50_000;
const JSON_HEADERS = { "Cache-Control": "no-store" } as const;

export async function POST(req: NextRequest) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "Request body must be valid JSON." },
      { status: 400, headers: JSON_HEADERS },
    );
  }

  const parsed = BaseRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_failed",
        message: "Request payload failed validation.",
        issues: parsed.error.flatten(),
      },
      { status: 400, headers: JSON_HEADERS },
    );
  }
  const input = parsed.data;

  const providerId = input.provider ?? pickDefaultProviderId();
  const provider = getProvider(providerId);
  if (!provider.isAvailable()) {
    return NextResponse.json(
      {
        error: "provider_unavailable",
        message: provider.whyUnavailable() ?? `Provider ${providerId} is not configured.`,
        provider: providerId,
      },
      { status: 424, headers: JSON_HEADERS },
    );
  }

  const ip = getClientIp(req.headers);
  const rl = await checkRateLimit(ip);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message:
          rl.scope === "day"
            ? "Daily request limit reached. Try again tomorrow."
            : "Slow down — too many requests in the last minute.",
        scope: rl.scope,
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      {
        status: 429,
        headers: { ...JSON_HEADERS, "Retry-After": String(rl.retryAfterSeconds) },
      },
    );
  }

  const prompt = buildBasePromptFromRequest(input);

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), SOFT_TIMEOUT_MS);

  let rawImage: Buffer;
  try {
    rawImage = await provider.generateFromText(prompt, {
      aspectRatio: "1:1",
      imageSize: "1K",
      signal: abort.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof ProviderError) {
      console.warn(
        `[generate-base] provider=${err.providerId} code=${err.code} message=${err.message}`,
      );
      return NextResponse.json(
        {
          error: err.code,
          message: err.message,
          provider: err.providerId,
          ...(err.retryAfterSeconds ? { retryAfterSeconds: err.retryAfterSeconds } : {}),
        },
        {
          status: providerErrorToStatus(err.code),
          headers: {
            ...JSON_HEADERS,
            ...(err.retryAfterSeconds
              ? { "Retry-After": String(err.retryAfterSeconds) }
              : {}),
          },
        },
      );
    }
    if (abort.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) {
      return NextResponse.json(
        {
          error: "timeout",
          message: "Generation took longer than 50 seconds. Please try again.",
          provider: providerId,
        },
        { status: 504, headers: JSON_HEADERS },
      );
    }
    console.error(`[generate-base] unexpected error from ${providerId}:`, err);
    return NextResponse.json(
      {
        error: "upstream",
        message: "Image generation failed.",
        provider: providerId,
      },
      { status: 502, headers: JSON_HEADERS },
    );
  } finally {
    clearTimeout(timer);
  }

  let transparent: Buffer;
  let trimmed: Buffer;
  try {
    transparent = await removeBackground(rawImage);
    trimmed = await trimToAlphaBoundingBox(transparent, 8);
  } catch (err) {
    console.error("[generate-base] background-removal/sharp error:", err);
    return NextResponse.json(
      {
        error: "image_processing_failed",
        message: "Failed to process the generated image.",
        provider: providerId,
      },
      { status: 500, headers: JSON_HEADERS },
    );
  }

  const meta = await pngMetadata(trimmed);
  const dataUrl = `data:image/png;base64,${trimmed.toString("base64")}`;

  const body: BaseResponse = {
    image: dataUrl,
    meta: {
      width: meta.width,
      height: meta.height,
      generatedAt: new Date().toISOString(),
      model: provider.modelLabel,
      provider: providerId,
      ppu: PPU_BY_STYLE[input.style],
      style: input.style,
    },
  };

  return NextResponse.json(body, { headers: JSON_HEADERS });
}

function providerErrorToStatus(code: ProviderError["code"]): number {
  switch (code) {
    case "safety":
      return 422;
    case "rate_limit":
      return 429;
    case "auth":
      return 502;
    case "timeout":
      return 504;
    case "no_image":
      return 502;
    case "unavailable":
      return 424;
    case "upstream":
    default:
      return 502;
  }
}
