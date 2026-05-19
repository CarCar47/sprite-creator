import { NextResponse, type NextRequest } from "next/server";
import { ActionRequestSchema, type ActionResponse } from "@/lib/validators";
import {
  buildActionPromptFor,
  GRID_BY_FRAME_COUNT,
  type ActionPromptInput,
} from "@/lib/prompts/actions";
import { getProvider, pickDefaultProviderId } from "@/lib/providers/registry";
import { ProviderError } from "@/lib/providers/types";
import { removeBackground } from "@/lib/backgroundRemoval";
import { buildSpriteSheet } from "@/lib/spriteSheet";
import { buildManifest } from "@/lib/manifest";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOFT_TIMEOUT_MS = 50_000;
const JSON_HEADERS = { "Cache-Control": "no-store" } as const;

function dataUrlToBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
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

  const parsed = ActionRequestSchema.safeParse(payload);
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

  const layout = GRID_BY_FRAME_COUNT[input.frameCount];
  const promptInput: ActionPromptInput = {
    description: input.description,
    style: input.style,
    chromaColor: input.chromaColor,
    frameCount: input.frameCount,
    palette: input.palette,
  };
  const prompt = buildActionPromptFor(input.action, promptInput);

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), SOFT_TIMEOUT_MS);

  let rawGrid: Buffer;
  try {
    const opts = {
      aspectRatio: layout.cols === layout.rows ? ("1:1" as const) : ("1:1" as const),
      imageSize: input.frameCount >= 9 ? ("2K" as const) : ("1K" as const),
      seed: input.seed,
      signal: abort.signal,
    };

    if (provider.supportsReference && provider.generateFromTextAndReference) {
      rawGrid = await provider.generateFromTextAndReference(
        prompt,
        { mimeType: "image/png", base64: dataUrlToBase64(input.baseImage) },
        opts,
      );
    } else {
      rawGrid = await provider.generateFromText(prompt, opts);
    }
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof ProviderError) {
      console.warn(
        `[generate-action] provider=${err.providerId} code=${err.code} message=${err.message}`,
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
    console.error(`[generate-action] unexpected from ${providerId}:`, err);
    return NextResponse.json(
      {
        error: "upstream",
        message: "Action sheet generation failed.",
        provider: providerId,
      },
      { status: 502, headers: JSON_HEADERS },
    );
  } finally {
    clearTimeout(timer);
  }

  let sheetBuffer: Buffer;
  let frameWidth: number;
  let frameHeight: number;
  let frameQuality: import("@/lib/spriteSheet").FrameQuality[];
  try {
    const transparentGrid = await removeBackground(rawGrid, input.chromaColor, input.bgRemoval);
    const built = await buildSpriteSheet(
      transparentGrid,
      layout.cols,
      layout.rows,
      8,
    );
    sheetBuffer = built.sheet;
    frameWidth = built.frameWidth;
    frameHeight = built.frameHeight;
    frameQuality = built.frameQuality;
  } catch (err) {
    console.error("[generate-action] image-processing error:", err);
    return NextResponse.json(
      {
        error: "image_processing_failed",
        message: "Failed to slice and repack the action grid.",
        provider: providerId,
      },
      { status: 500, headers: JSON_HEADERS },
    );
  }

  const manifest = buildManifest({
    frameCount: input.frameCount,
    frameWidth,
    frameHeight,
    action: input.action,
    style: input.style,
    provider: providerId,
    modelVersion: provider.modelLabel,
    prompt,
    frameQuality,
  });

  const body: ActionResponse = {
    sheet: `data:image/png;base64,${sheetBuffer.toString("base64")}`,
    manifest,
  };

  return NextResponse.json(body, { headers: JSON_HEADERS });
}
