import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";
import {
  ImportRequestSchema,
  type ImportResponse,
  type ImportedRow,
} from "@/lib/validators";
import { composeSpriteSheet, type SlicedFrame } from "@/lib/spriteSheet";
import { buildManifest } from "@/lib/manifest";
import { removeBackground } from "@/lib/backgroundRemoval";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JSON_HEADERS = { "Cache-Control": "no-store" } as const;

function dataUrlToBuffer(dataUrl: string): Buffer {
  const comma = dataUrl.indexOf(",");
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Buffer.from(base64, "base64");
}

export async function POST(req: NextRequest) {
  try {
    return await handle(req);
  } catch (err) {
    console.error("[package-sprite] uncaught:", err);
    return NextResponse.json(
      {
        error: "internal",
        message:
          "An unexpected error occurred while packaging the sprite sheet. Check the file dimensions and grid settings.",
      },
      { status: 500, headers: JSON_HEADERS },
    );
  }
}

async function handle(req: NextRequest) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "Request body must be valid JSON." },
      { status: 400, headers: JSON_HEADERS },
    );
  }

  const parsed = ImportRequestSchema.safeParse(payload);
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

  if (input.rowLabels.length !== input.rows) {
    return NextResponse.json(
      {
        error: "validation_failed",
        message: `rowLabels length (${input.rowLabels.length}) must equal rows (${input.rows}).`,
      },
      { status: 400, headers: JSON_HEADERS },
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

  let source = dataUrlToBuffer(input.image);

  // Normalize to PNG with alpha + ensure we know the dimensions.
  let meta: sharp.Metadata;
  try {
    source = await sharp(source).ensureAlpha().png({ compressionLevel: 9 }).toBuffer();
    meta = await sharp(source).metadata();
  } catch (err) {
    console.error("[package-sprite] normalize error:", err);
    return NextResponse.json(
      {
        error: "image_processing_failed",
        message: "Could not read the uploaded image. Make sure it is a valid PNG/JPEG/WEBP.",
      },
      { status: 400, headers: JSON_HEADERS },
    );
  }

  const totalW = meta.width ?? 0;
  const totalH = meta.height ?? 0;
  if (totalW % input.cols !== 0 || totalH % input.rows !== 0) {
    return NextResponse.json(
      {
        error: "grid_mismatch",
        message: `Image is ${totalW}×${totalH}, not evenly divisible by ${input.cols} cols × ${input.rows} rows. Try different row/col counts, or crop your image to a multiple of those dimensions.`,
      },
      { status: 400, headers: JSON_HEADERS },
    );
  }
  const cellW = totalW / input.cols;
  const cellH = totalH / input.rows;

  if (input.applyBackgroundRemoval) {
    try {
      source = await removeBackground(source, input.chromaColor, input.bgRemoval);
    } catch (err) {
      console.error("[package-sprite] bg removal error:", err);
      return NextResponse.json(
        {
          error: "image_processing_failed",
          message: "Background removal failed. Try a different strength or skip removal.",
        },
        { status: 500, headers: JSON_HEADERS },
      );
    }
  }

  const importedRows: ImportedRow[] = [];

  for (let rowIdx = 0; rowIdx < input.rows; rowIdx++) {
    const label = input.rowLabels[rowIdx]!;
    const frames: SlicedFrame[] = [];
    try {
      for (let colIdx = 0; colIdx < input.cols; colIdx++) {
        const buffer = await sharp(source)
          .extract({
            left: colIdx * cellW,
            top: rowIdx * cellH,
            width: cellW,
            height: cellH,
          })
          .png({ compressionLevel: 9 })
          .toBuffer();
        frames.push({ index: colIdx, buffer });
      }
    } catch (err) {
      console.error(`[package-sprite] row ${rowIdx} slicing error:`, err);
      return NextResponse.json(
        {
          error: "image_processing_failed",
          message: `Failed to slice row ${rowIdx + 1}. Check that the grid dimensions match the image.`,
        },
        { status: 500, headers: JSON_HEADERS },
      );
    }

    let composed;
    try {
      composed = await composeSpriteSheet(frames, 4);
    } catch (err) {
      console.error(`[package-sprite] row ${rowIdx} compose error:`, err);
      return NextResponse.json(
        {
          error: "image_processing_failed",
          message: `Failed to package row ${rowIdx + 1} ("${label.action}"). The row may be empty or fully transparent.`,
        },
        { status: 500, headers: JSON_HEADERS },
      );
    }

    const manifest = buildManifest({
      frameCount: composed.frameCount,
      frameWidth: composed.frameWidth,
      frameHeight: composed.frameHeight,
      action: label.action,
      style: input.style,
      provider: "import",
      modelVersion: "imported",
      prompt: `imported sheet row ${rowIdx + 1}: ${label.action}`,
      frameQuality: composed.frameQuality,
      fpsOverride: label.fpsOverride,
      pivotOverride: label.pivot,
    });

    importedRows.push({
      action: label.action,
      sheet: `data:image/png;base64,${composed.sheet.toString("base64")}`,
      manifest,
    });
  }

  const body: ImportResponse = { rows: importedRows };
  return NextResponse.json(body, { headers: JSON_HEADERS });
}
