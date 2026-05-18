import { NextResponse, type NextRequest } from "next/server";
import { BaseRequestSchema, PPU_BY_STYLE } from "@/lib/validators";
import type { BaseResponse } from "@/lib/validators";
import { buildBasePromptFromRequest } from "@/lib/prompts/baseCharacter";
import {
  generateImageFromText,
  GeminiSafetyError,
  GeminiNoImageError,
  GeminiUpstreamError,
} from "@/lib/gemini";
import { chromaKeyToAlpha } from "@/lib/chromaKey";
import { trimToAlphaBoundingBox, pngMetadata } from "@/lib/imageProcessing";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOFT_TIMEOUT_MS = 50_000;

const JSON_HEADERS = {
  "Cache-Control": "no-store",
} as const;

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

  let rawPng: Buffer;
  try {
    rawPng = await generateImageFromText(prompt, {
      aspectRatio: "1:1",
      imageSize: "1K",
      signal: abort.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (abort.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) {
      return NextResponse.json(
        {
          error: "gemini_timeout",
          message: "Generation took longer than 50 seconds. Please try again.",
        },
        { status: 504, headers: JSON_HEADERS },
      );
    }
    if (err instanceof GeminiSafetyError) {
      return NextResponse.json(
        {
          error: "safety_block",
          message: "The prompt was blocked by content safety filters.",
          category: err.category,
        },
        { status: 422, headers: JSON_HEADERS },
      );
    }
    if (err instanceof GeminiNoImageError) {
      return NextResponse.json(
        {
          error: "no_image",
          message: "Model returned no image. Try a more specific description.",
        },
        { status: 502, headers: JSON_HEADERS },
      );
    }
    if (err instanceof GeminiUpstreamError) {
      return NextResponse.json(
        {
          error: "upstream_unavailable",
          message: "Image generation backend is not available. Check server configuration.",
        },
        { status: 502, headers: JSON_HEADERS },
      );
    }
    console.error("[generate-base] gemini error:", err);
    return NextResponse.json(
      { error: "gemini_error", message: "Image generation failed." },
      { status: 502, headers: JSON_HEADERS },
    );
  } finally {
    clearTimeout(timer);
  }

  let transparent: Buffer;
  let trimmed: Buffer;
  try {
    transparent = await chromaKeyToAlpha(rawPng, input.chromaColor);
    trimmed = await trimToAlphaBoundingBox(transparent, 8);
  } catch (err) {
    console.error("[generate-base] sharp error:", err);
    return NextResponse.json(
      { error: "image_processing_failed", message: "Failed to process the generated image." },
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
      model: process.env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-image-preview",
      ppu: PPU_BY_STYLE[input.style],
      style: input.style,
    },
  };

  return NextResponse.json(body, { headers: JSON_HEADERS });
}
