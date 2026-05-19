import { NextResponse, type NextRequest } from "next/server";
import { ActionRequestSchema, type ActionResponse } from "@/lib/validators";
import {
  buildActionPromptFor,
  buildPerFramePrompt,
  GRID_BY_FRAME_COUNT,
  type ActionPromptInput,
} from "@/lib/prompts/actions";
import { getProvider, pickDefaultProviderId } from "@/lib/providers/registry";
import { ProviderError } from "@/lib/providers/types";
import { removeBackground } from "@/lib/backgroundRemoval";
import {
  buildSpriteSheet,
  composeSpriteSheet,
  type FrameQuality,
  type SlicedFrame,
} from "@/lib/spriteSheet";
import { buildManifest } from "@/lib/manifest";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOFT_TIMEOUT_MS = 50_000;
const CAREFUL_TOTAL_TIMEOUT_MS = 270_000;
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
  try {
    return await handlePost(req);
  } catch (err) {
    console.error("[generate-action] uncaught:", err);
    return NextResponse.json(
      {
        error: "internal",
        message:
          "An unexpected error occurred during action-sheet generation. Try again, or check Vercel logs if it recurs.",
      },
      { status: 500, headers: JSON_HEADERS },
    );
  }
}

async function handlePost(req: NextRequest) {
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

  // Force fast mode for 16-frame grids — careful would do 16 sequential ~9s calls and
  // exceed the 300s Vercel function ceiling on cold-start providers.
  const effectiveQuality =
    input.frameCount === 16 && input.qualityMode === "careful" ? "fast" : input.qualityMode;

  const promptInput: ActionPromptInput = {
    description: input.description,
    style: input.style,
    chromaColor: input.chromaColor,
    frameCount: input.frameCount,
    palette: input.palette,
  };

  if (effectiveQuality === "fast") {
    return runFastMode(input, provider, providerId, promptInput);
  }
  return runCarefulMode(input, provider, providerId, promptInput);
}

async function runFastMode(
  input: ReturnType<typeof ActionRequestSchema.parse>,
  provider: ReturnType<typeof getProvider>,
  providerId: string,
  promptInput: ActionPromptInput,
): Promise<Response> {
  const layout = GRID_BY_FRAME_COUNT[input.frameCount];
  const prompt = buildActionPromptFor(input.action, promptInput);

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), SOFT_TIMEOUT_MS);

  let rawGrid: Buffer;
  try {
    const opts = {
      aspectRatio: "1:1" as const,
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
    return providerErrorResponse(err, providerId, abort);
  } finally {
    clearTimeout(timer);
  }

  let sheetBuffer: Buffer;
  let frameWidth: number;
  let frameHeight: number;
  let frameQuality: FrameQuality[];
  try {
    const transparentGrid = await removeBackground(
      rawGrid,
      input.chromaColor,
      input.bgRemoval,
    );
    const built = await buildSpriteSheet(transparentGrid, layout.cols, layout.rows, 8);
    sheetBuffer = built.sheet;
    frameWidth = built.frameWidth;
    frameHeight = built.frameHeight;
    frameQuality = built.frameQuality;
  } catch (err) {
    console.error("[generate-action:fast] image-processing error:", err);
    return NextResponse.json(
      {
        error: "image_processing_failed",
        message: "Failed to slice and repack the action grid.",
        provider: providerId,
      },
      { status: 500, headers: JSON_HEADERS },
    );
  }

  return successResponse({
    input,
    providerId,
    provider,
    prompt,
    sheetBuffer,
    frameWidth,
    frameHeight,
    frameQuality,
  });
}

async function runCarefulMode(
  input: ReturnType<typeof ActionRequestSchema.parse>,
  provider: ReturnType<typeof getProvider>,
  providerId: string,
  promptInput: ActionPromptInput,
): Promise<Response> {
  const startedAt = Date.now();
  const frameBuffers: SlicedFrame[] = [];
  // Build a combined prompt string (just the first frame's prompt) for the manifest hash.
  // The actual model calls use per-frame prompts but the hash represents the action.
  const manifestPrompt = buildPerFramePrompt(promptInput, input.action, 0);

  for (let i = 0; i < input.frameCount; i++) {
    if (Date.now() - startedAt > CAREFUL_TOTAL_TIMEOUT_MS) {
      return NextResponse.json(
        {
          error: "timeout",
          message:
            "Careful mode is taking too long for this frame count. Try Fast mode or fewer frames.",
          provider: providerId,
        },
        { status: 504, headers: JSON_HEADERS },
      );
    }

    const framePrompt = buildPerFramePrompt(promptInput, input.action, i);
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), SOFT_TIMEOUT_MS);

    let frameRaw: Buffer;
    try {
      const opts = {
        aspectRatio: "1:1" as const,
        imageSize: "1K" as const,
        seed: typeof input.seed === "number" ? input.seed + i : undefined,
        signal: abort.signal,
      };
      if (provider.supportsReference && provider.generateFromTextAndReference) {
        frameRaw = await provider.generateFromTextAndReference(
          framePrompt,
          { mimeType: "image/png", base64: dataUrlToBase64(input.baseImage) },
          opts,
        );
      } else {
        frameRaw = await provider.generateFromText(framePrompt, opts);
      }
    } catch (err) {
      clearTimeout(timer);
      return providerErrorResponse(err, providerId, abort, { frameIndex: i });
    } finally {
      clearTimeout(timer);
    }

    let frameTransparent: Buffer;
    try {
      frameTransparent = await removeBackground(
        frameRaw,
        input.chromaColor,
        input.bgRemoval,
      );
    } catch (err) {
      console.error(`[generate-action:careful frame ${i}] bg-removal error:`, err);
      return NextResponse.json(
        {
          error: "image_processing_failed",
          message: `Failed to remove background from frame ${i + 1}.`,
          provider: providerId,
        },
        { status: 500, headers: JSON_HEADERS },
      );
    }

    frameBuffers.push({ index: i, buffer: frameTransparent });
  }

  let sheetBuffer: Buffer;
  let frameWidth: number;
  let frameHeight: number;
  let frameQuality: FrameQuality[];
  try {
    const composed = await composeSpriteSheet(frameBuffers, 8);
    sheetBuffer = composed.sheet;
    frameWidth = composed.frameWidth;
    frameHeight = composed.frameHeight;
    frameQuality = composed.frameQuality;
  } catch (err) {
    console.error("[generate-action:careful] composition error:", err);
    return NextResponse.json(
      {
        error: "image_processing_failed",
        message: "Failed to compose per-frame outputs into a sprite sheet.",
        provider: providerId,
      },
      { status: 500, headers: JSON_HEADERS },
    );
  }

  return successResponse({
    input,
    providerId,
    provider,
    prompt: manifestPrompt,
    sheetBuffer,
    frameWidth,
    frameHeight,
    frameQuality,
  });
}

function providerErrorResponse(
  err: unknown,
  providerId: string,
  abort: AbortController,
  context: { frameIndex?: number } = {},
): Response {
  if (err instanceof ProviderError) {
    console.warn(
      `[generate-action${context.frameIndex !== undefined ? ` frame ${context.frameIndex}` : ""}] provider=${err.providerId} code=${err.code} message=${err.message}`,
    );
    return NextResponse.json(
      {
        error: err.code,
        message: err.message,
        provider: err.providerId,
        ...(context.frameIndex !== undefined ? { frameIndex: context.frameIndex } : {}),
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
        ...(context.frameIndex !== undefined ? { frameIndex: context.frameIndex } : {}),
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
}

function successResponse(args: {
  input: ReturnType<typeof ActionRequestSchema.parse>;
  providerId: string;
  provider: ReturnType<typeof getProvider>;
  prompt: string;
  sheetBuffer: Buffer;
  frameWidth: number;
  frameHeight: number;
  frameQuality: FrameQuality[];
}): Response {
  const manifest = buildManifest({
    frameCount: args.input.frameCount,
    frameWidth: args.frameWidth,
    frameHeight: args.frameHeight,
    action: args.input.action,
    style: args.input.style,
    provider: args.providerId as "huggingface" | "pollinations" | "gemini",
    modelVersion: args.provider.modelLabel,
    prompt: args.prompt,
    frameQuality: args.frameQuality,
  });

  const body: ActionResponse = {
    sheet: `data:image/png;base64,${args.sheetBuffer.toString("base64")}`,
    manifest,
  };

  return NextResponse.json(body, { headers: JSON_HEADERS });
}
