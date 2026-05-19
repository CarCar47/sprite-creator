"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ACTION_KEYS,
  ACTION_LABELS,
  type ActionKey,
} from "@/lib/prompts/actions";
import {
  STYLE_LABELS,
  type BgRemovalStrength,
  type ImportedRow,
  type ImportResponse,
  type Style,
} from "@/lib/validators";
import { detectRowsFromAlpha, fallbackEqualRows } from "@/lib/spriteAnalysis";

const STYLES: Style[] = ["pixel16", "pixel32", "cartoon", "modern"];
const BG_STRENGTHS: BgRemovalStrength[] = [
  "none",
  "minimal",
  "gentle",
  "balanced",
  "aggressive",
];

interface RowSpec {
  action: string;
  rect: { x: number; y: number; width: number; height: number };
  frameCount: number;
  fpsOverride?: number;
}

interface ApiError {
  error: string;
  message?: string;
}

const ROW_COLORS = [
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
  "#84cc16",
  "#f97316",
  "#06b6d4",
];

export function SpriteImporter() {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const [style, setStyle] = useState<Style>("pixel32");
  const [applyBg, setApplyBg] = useState(false);
  const [bgRemoval, setBgRemoval] = useState<BgRemovalStrength>("balanced");
  const [rows, setRows] = useState<RowSpec[]>([]);
  const [activeRow, setActiveRow] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [result, setResult] = useState<ImportedRow[] | null>(null);
  const [zipping, setZipping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Load uploaded image into an Image element so we can both draw it and analyze pixels.
  // setImageEl in an effect is the right pattern here: an HTMLImageElement is an external
  // browser resource that can only be constructed in a browser context, and its onload is
  // async. There is no synchronous derivation possible.
  useEffect(() => {
    if (!imageDataUrl) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setImageEl(null);
      return;
    }
    const img = new Image();
    img.onload = () => setImageEl(img);
    img.onerror = () => {
      setError({
        error: "image_load_failed",
        message: "Could not read that image. Try a different file.",
      });
      setImageEl(null);
    };
    img.src = imageDataUrl;
  }, [imageDataUrl]);

  // Whenever the image, rows, or in-progress drag change, repaint the canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageEl) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const maxW = 600;
    const scale = Math.min(1, maxW / imageEl.naturalWidth);
    canvas.width = Math.round(imageEl.naturalWidth * scale);
    canvas.height = Math.round(imageEl.naturalHeight * scale);
    canvas.dataset.scale = String(scale);

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imageEl, 0, 0, canvas.width, canvas.height);

    rows.forEach((row, i) => {
      const color = ROW_COLORS[i % ROW_COLORS.length]!;
      const x = row.rect.x * scale;
      const y = row.rect.y * scale;
      const w = row.rect.width * scale;
      const h = row.rect.height * scale;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, Math.max(1, w - 2), Math.max(1, h - 2));
      ctx.fillStyle = color;
      ctx.fillRect(x + 1, y + 1, 60, 18);
      ctx.fillStyle = "#ffffff";
      ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText(`Row ${i + 1}`, x + 5, y + 14);
    });

    if (drag && dragCurrent && activeRow !== null) {
      const color = ROW_COLORS[activeRow % ROW_COLORS.length]!;
      ctx.strokeStyle = color;
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 2;
      const dx = Math.min(drag.x, dragCurrent.x);
      const dy = Math.min(drag.y, dragCurrent.y);
      const dw = Math.abs(dragCurrent.x - drag.x);
      const dh = Math.abs(dragCurrent.y - drag.y);
      ctx.strokeRect(dx, dy, dw, dh);
      ctx.setLineDash([]);
    }
  }, [imageEl, rows, drag, dragCurrent, activeRow]);

  function handleFile(file: File) {
    setError(null);
    setResult(null);
    setRows([]);
    setActiveRow(null);
    if (!/^image\/(png|jpeg|jpg|webp)$/.test(file.type)) {
      setError({ error: "invalid_file", message: "Pick a PNG, JPEG, or WEBP image." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(reader.result as string);
    reader.onerror = () =>
      setError({ error: "read_failed", message: "Could not read the file." });
    reader.readAsDataURL(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  async function handleAutoDetect() {
    if (!imageEl) return;
    setError(null);
    try {
      const detected = await detectRowsFromAlpha(imageEl);
      const useRows =
        detected.length > 0
          ? detected
          : fallbackEqualRows(imageEl.naturalHeight, 5, 4);
      const next: RowSpec[] = useRows.map((d, i) => ({
        action: rows[i]?.action ?? "",
        rect: {
          x: 0,
          y: d.top,
          width: imageEl.naturalWidth,
          height: d.bottom - d.top,
        },
        frameCount: d.frameCount,
        fpsOverride: rows[i]?.fpsOverride,
      }));
      setRows(next);
      setActiveRow(null);
    } catch (err) {
      setError({
        error: "auto_detect_failed",
        message: err instanceof Error ? err.message : "Could not analyze the image.",
      });
    }
  }

  function handleAddRow() {
    if (!imageEl) return;
    const lastBottom =
      rows.length > 0 ? rows[rows.length - 1]!.rect.y + rows[rows.length - 1]!.rect.height : 0;
    const remainingHeight = Math.max(20, imageEl.naturalHeight - lastBottom);
    const newRow: RowSpec = {
      action: "",
      rect: {
        x: 0,
        y: lastBottom,
        width: imageEl.naturalWidth,
        height: Math.min(remainingHeight, Math.floor(imageEl.naturalHeight / 5)),
      },
      frameCount: 4,
    };
    setRows((prev) => [...prev, newRow]);
    setActiveRow(rows.length);
  }

  function handleRemoveRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
    setActiveRow(null);
  }

  function getCanvasMouse(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (activeRow === null) return;
    setDrag(getCanvasMouse(e));
    setDragCurrent(getCanvasMouse(e));
  }
  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (drag === null) return;
    setDragCurrent(getCanvasMouse(e));
  }
  const onMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (drag === null || activeRow === null || !imageEl) {
        setDrag(null);
        setDragCurrent(null);
        return;
      }
      const canvas = canvasRef.current;
      if (!canvas) return;
      const scale = parseFloat(canvas.dataset.scale ?? "1");
      const end = getCanvasMouse(e);
      const x = Math.min(drag.x, end.x);
      const y = Math.min(drag.y, end.y);
      const w = Math.abs(end.x - drag.x);
      const h = Math.abs(end.y - drag.y);
      if (w < 4 || h < 4) {
        setDrag(null);
        setDragCurrent(null);
        return;
      }
      const imgX = Math.max(0, Math.round(x / scale));
      const imgY = Math.max(0, Math.round(y / scale));
      const imgW = Math.min(imageEl.naturalWidth - imgX, Math.round(w / scale));
      const imgH = Math.min(imageEl.naturalHeight - imgY, Math.round(h / scale));
      setRows((prev) =>
        prev.map((r, i) =>
          i === activeRow
            ? { ...r, rect: { x: imgX, y: imgY, width: imgW, height: imgH } }
            : r,
        ),
      );
      setActiveRow(null);
      setDrag(null);
      setDragCurrent(null);
    },
    [drag, activeRow, imageEl],
  );

  function updateRow(idx: number, patch: Partial<RowSpec>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  const canSubmit =
    !loading &&
    imageDataUrl !== null &&
    rows.length > 0 &&
    rows.every((r) => r.action.trim().length > 0 && r.rect.width > 0 && r.rect.height > 0);

  async function handleSubmit() {
    if (!imageDataUrl) return;
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/package-sprite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: imageDataUrl,
          style,
          applyBackgroundRemoval: applyBg,
          bgRemoval,
          rows: rows.map((r) => ({
            action: r.action.trim(),
            rect: r.rect,
            frameCount: r.frameCount,
            ...(r.fpsOverride ? { fpsOverride: r.fpsOverride } : {}),
          })),
        }),
      });
      const body = (await res.json()) as ImportResponse | ApiError;
      if (!res.ok) {
        setError(body as ApiError);
        return;
      }
      setResult((body as ImportResponse).rows);
    } catch (err) {
      setError({
        error: "network_error",
        message: err instanceof Error ? err.message : "Network request failed.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleDownloadZip() {
    if (!result) return;
    setZipping(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const row of result) {
        const sheetB64 = row.sheet.split(",", 2)[1] ?? "";
        const slug = slugify(row.action);
        zip.file(`${slug}.png`, sheetB64, { base64: true });
        zip.file(`${slug}.json`, JSON.stringify(row.manifest, null, 2));
      }
      zip.file("UNITY_IMPORT.txt", buildImportInstructions(result.map((r) => r.action)));
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sprite-creator-import.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setZipping(false);
    }
  }

  return (
    <section className="mt-12 w-full max-w-5xl border-t border-zinc-200 pt-8 dark:border-zinc-800">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Already have a sprite sheet? Package it for Unity
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Drop in a sprite sheet of any size. Hit <strong>Auto-detect rows</strong> for the
          common case where rows are separated by transparent gutters, or click{" "}
          <strong>Draw region</strong> on a row and drag a rectangle over the part of the
          image that row should cover. No cropping required — the importer slices only what
          you outline.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
        <div className="flex flex-col gap-4">
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="flex h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-zinc-300 bg-white text-sm text-zinc-600 hover:border-zinc-500 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            {imageDataUrl ? (
              <>
                <span className="font-medium">Replace image</span>
                <span className="text-xs">
                  {imageEl ? `${imageEl.naturalWidth} × ${imageEl.naturalHeight}px` : ""}
                </span>
              </>
            ) : (
              <>
                <span className="font-medium">Click or drop a sprite sheet here</span>
                <span className="text-xs">PNG, JPEG, or WEBP</span>
              </>
            )}
          </div>

          {imageEl && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAutoDetect}
                className="flex-1 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
              >
                Auto-detect rows
              </button>
              <button
                type="button"
                onClick={handleAddRow}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                + Add empty row
              </button>
            </div>
          )}

          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Style (drives PPU / filter mode in the manifest)
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value as Style)}
              className="rounded-md border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              {STYLES.map((s) => (
                <option key={s} value={s}>
                  {STYLE_LABELS[s]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={applyBg}
              onChange={(e) => setApplyBg(e.target.checked)}
            />
            Remove background before packaging
          </label>
          {applyBg && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {BG_STRENGTHS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setBgRemoval(s)}
                  className={`rounded-md border px-2 py-1.5 text-xs capitalize transition-colors ${
                    bgRemoval === s
                      ? "border-zinc-900 bg-zinc-50 dark:border-zinc-50 dark:bg-zinc-900"
                      : "border-zinc-300 dark:border-zinc-700"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Rows ({rows.length})
            </legend>
            <datalist id="standard-actions">
              {ACTION_KEYS.map((a: ActionKey) => (
                <option key={a} value={a}>
                  {ACTION_LABELS[a]}
                </option>
              ))}
            </datalist>
            <div className="flex flex-col gap-2">
              {rows.map((row, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-2 rounded-md border border-zinc-200 p-2 dark:border-zinc-800"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 rounded"
                      style={{ backgroundColor: ROW_COLORS[i % ROW_COLORS.length] }}
                    />
                    <span className="text-xs font-medium text-zinc-500">Row {i + 1}</span>
                    <input
                      type="text"
                      list="standard-actions"
                      value={row.action}
                      onChange={(e) => updateRow(i, { action: e.target.value })}
                      placeholder="action name"
                      className="flex-1 rounded-md border border-zinc-300 bg-white p-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(i)}
                      className="rounded-md px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                      aria-label={`Remove row ${i + 1}`}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <span>
                      rect: {row.rect.x},{row.rect.y} {row.rect.width}×{row.rect.height}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveRow(activeRow === i ? null : i)}
                      className={`rounded-md border px-2 py-1 transition-colors ${
                        activeRow === i
                          ? "border-zinc-900 bg-zinc-900 text-zinc-50 dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                          : "border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                      }`}
                    >
                      {activeRow === i ? "Drawing… click image" : "Draw region"}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs text-zinc-700 dark:text-zinc-300">
                      frames
                      <input
                        type="number"
                        min={1}
                        max={32}
                        value={row.frameCount}
                        onChange={(e) =>
                          updateRow(i, {
                            frameCount: Math.max(1, Math.min(32, +e.target.value || 1)),
                          })
                        }
                        className="w-16 rounded-md border border-zinc-300 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900"
                      />
                    </label>
                    <label className="flex items-center gap-1 text-xs text-zinc-700 dark:text-zinc-300">
                      fps
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={row.fpsOverride ?? ""}
                        onChange={(e) =>
                          updateRow(i, {
                            fpsOverride: e.target.value ? +e.target.value : undefined,
                          })
                        }
                        placeholder="auto"
                        className="w-16 rounded-md border border-zinc-300 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900"
                      />
                    </label>
                  </div>
                </div>
              ))}
              {rows.length === 0 && imageEl && (
                <p className="text-xs text-zinc-500">
                  No rows yet. Click <strong>Auto-detect rows</strong> above to find them, or
                  click <strong>+ Add empty row</strong> and draw a rectangle on the image.
                </p>
              )}
            </div>
          </fieldset>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-lg bg-zinc-900 py-3 text-sm font-medium text-zinc-50 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:bg-zinc-50 dark:text-zinc-900 dark:disabled:bg-zinc-700"
          >
            {loading ? "Packaging…" : "Package for Unity"}
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {activeRow !== null
              ? `Drawing region for Row ${activeRow + 1} — click and drag on the image`
              : "Preview (rows shown as colored rectangles)"}
          </h3>
          <div
            className="overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700"
            style={{
              backgroundImage:
                "linear-gradient(45deg, #e5e5e5 25%, transparent 25%), linear-gradient(-45deg, #e5e5e5 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e5e5 75%), linear-gradient(-45deg, transparent 75%, #e5e5e5 75%)",
              backgroundSize: "20px 20px",
              backgroundPosition: "0 0, 0 10px, 10px -10px, 10px 0",
            }}
          >
            {imageEl ? (
              <canvas
                ref={canvasRef}
                className={`block w-full ${activeRow !== null ? "cursor-crosshair" : "cursor-default"}`}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={() => {
                  setDrag(null);
                  setDragCurrent(null);
                }}
              />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center text-sm text-zinc-500">
                Your uploaded sheet appears here.
              </div>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
            >
              <p className="font-medium">{error.error}</p>
              {error.message && <p className="mt-1">{error.message}</p>}
            </div>
          )}

          {result && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-emerald-700 dark:text-emerald-400">
                ✓ Packaged {result.length} row{result.length === 1 ? "" : "s"}.
              </p>
              <button
                type="button"
                onClick={handleDownloadZip}
                disabled={zipping}
                className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:bg-emerald-300"
              >
                {zipping ? "Building ZIP…" : `Download all (${result.length * 2 + 1} files)`}
              </button>
              <ul className="flex flex-col gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                {result.map((r) => (
                  <li
                    key={r.action}
                    className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800"
                  >
                    <div className="font-medium">{r.action}</div>
                    <div className="text-zinc-500">
                      {r.manifest.frame_count} frames @ {r.manifest.frame_width}×
                      {r.manifest.frame_height}px, fps {r.manifest.fps}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 40) || "action"
  );
}

function buildImportInstructions(actions: string[]): string {
  const list = actions.length
    ? actions.map((a) => `  - ${slugify(a)}.png + ${slugify(a)}.json`).join("\n")
    : "  (no rows)";
  return `Sprite Creator — Unity import guide (Imported sheet)
====================================================

Files in this ZIP:
${list}

For each row PNG:
  1. Drag the .png into your Unity Assets folder
  2. Inspector: Sprite Mode = Multiple
  3. Open Sprite Editor
  4. Slice -> Type: Grid By Cell Count
       Columns = manifest.columns
       Rows    = manifest.rows
  5. Slice, Apply, Close
  6. Expand the asset, select all sub-sprites
  7. Drag them into a scene to auto-create an Animation Clip
  8. In Animation window, set Samples = manifest.fps

Pixels Per Unit and Filter Mode come from the manifest under
"pixels_per_unit" and "filter_mode_hint".

License: MIT. https://github.com/CarCar47/sprite-creator
`;
}
