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

  const imgW = meta.width ?? 0;
  const imgH = meta.height ?? 0;

  // Validate each row's rect lies fully within the image bounds.
  for (let i = 0; i < input.rows.length; i++) {
    const row = input.rows[i]!;
    const r = row.rect;
    if (
      r.x + r.width > imgW ||
      r.y + r.height > imgH ||
      r.x < 0 ||
      r.y < 0 ||
      r.width < 1 ||
      r.height < 1
    ) {
      return NextResponse.json(
        {
          error: "rect_out_of_bounds",
          message: `Row ${i + 1} ("${row.action}") rectangle (${r.x},${r.y} ${r.width}×${r.height}) is outside the image bounds (${imgW}×${imgH}).`,
        },
        { status: 400, headers: JSON_HEADERS },
      );
    }
  }

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

  for (let rowIdx = 0; rowIdx < input.rows.length; rowIdx++) {
    const row = input.rows[rowIdx]!;
    const r = row.rect;

    // Extract the row's region from the source image.
    let rowBuffer: Buffer;
    try {
      rowBuffer = await sharp(source)
        .extract({ left: r.x, top: r.y, width: r.width, height: r.height })
        .png({ compressionLevel: 9 })
        .toBuffer();
    } catch (err) {
      console.error(`[package-sprite] row ${rowIdx} extract error:`, err);
      return NextResponse.json(
        {
          error: "image_processing_failed",
          message: `Failed to extract row ${rowIdx + 1} ("${row.action}"): ${err instanceof Error ? err.message : String(err)}`,
        },
        { status: 500, headers: JSON_HEADERS },
      );
    }

    // Slice this row's region into `frameCount` equal-width frames.
    const cellWidth = Math.floor(r.width / row.frameCount);
    if (cellWidth < 1) {
      return NextResponse.json(
        {
          error: "validation_failed",
          message: `Row ${rowIdx + 1} ("${row.action}"): frame count ${row.frameCount} is too high for the row width ${r.width}.`,
        },
        { status: 400, headers: JSON_HEADERS },
      );
    }
    const usedWidth = cellWidth * row.frameCount;
    // If the row width isn't perfectly divisible, drop the trailing remainder rather
    // than scaling — the remainder is usually 1-2 pixels of padding and the user's
    // visual grid stays intact.
    const frames: SlicedFrame[] = [];
    try {
      for (let colIdx = 0; colIdx < row.frameCount; colIdx++) {
        const cellBuf = await sharp(rowBuffer)
          .extract({
            left: colIdx * cellWidth,
            top: 0,
            width: cellWidth,
            height: r.height,
          })
          .png({ compressionLevel: 9 })
          .toBuffer();
        frames.push({ index: colIdx, buffer: cellBuf });
      }
    } catch (err) {
      console.error(`[package-sprite] row ${rowIdx} slicing error:`, err);
      return NextResponse.json(
        {
          error: "image_processing_failed",
          message: `Failed to slice frames in row ${rowIdx + 1} ("${row.action}").`,
        },
        { status: 500, headers: JSON_HEADERS },
      );
    }
    void usedWidth;

    let composed;
    try {
      composed = await composeSpriteSheet(frames, 4);
    } catch (err) {
      console.error(`[package-sprite] row ${rowIdx} compose error:`, err);
      return NextResponse.json(
        {
          error: "image_processing_failed",
          message: `Failed to package row ${rowIdx + 1} ("${row.action}"). The row may be empty or fully transparent.`,
        },
        { status: 500, headers: JSON_HEADERS },
      );
    }

    const manifest = buildManifest({
      frameCount: composed.frameCount,
      frameWidth: composed.frameWidth,
      frameHeight: composed.frameHeight,
      action: row.action,
      style: input.style,
      provider: "import",
      modelVersion: "imported",
      prompt: `imported sheet row ${rowIdx + 1}: ${row.action}`,
      frameQuality: composed.frameQuality,
      fpsOverride: row.fpsOverride,
      pivotOverride: row.pivot,
    });

    importedRows.push({
      action: row.action,
      sheet: `data:image/png;base64,${composed.sheet.toString("base64")}`,
      manifest,
    });
  }

  const body: ImportResponse = { rows: importedRows };
  return NextResponse.json(body, { headers: JSON_HEADERS });
}
