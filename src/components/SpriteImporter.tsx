"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

const STYLES: Style[] = ["pixel16", "pixel32", "cartoon", "modern"];
const BG_STRENGTHS: BgRemovalStrength[] = [
  "none",
  "minimal",
  "gentle",
  "balanced",
  "aggressive",
];

interface RowLabel {
  action: string;
  fpsOverride?: number;
}

interface ApiError {
  error: string;
  message?: string;
}

export function SpriteImporter() {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const [rows, setRows] = useState(1);
  const [cols, setCols] = useState(4);
  const [style, setStyle] = useState<Style>("pixel32");
  const [applyBg, setApplyBg] = useState(false);
  const [bgRemoval, setBgRemoval] = useState<BgRemovalStrength>("balanced");
  const [rowLabels, setRowLabels] = useState<RowLabel[]>([{ action: "idle" }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [result, setResult] = useState<ImportedRow[] | null>(null);
  const [zipping, setZipping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Resize the per-row labels array to match the user's row count. setState in an
    // effect is the standard pattern when a derived array needs to track an input value
    // while preserving any edits the user made to surviving entries.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRowLabels((prev) => {
      if (prev.length === rows) return prev;
      if (prev.length < rows) {
        const next = [...prev];
        while (next.length < rows) next.push({ action: "" });
        return next;
      }
      return prev.slice(0, rows);
    });
  }, [rows]);

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    if (!/^image\/(png|jpeg|jpg|webp)$/.test(file.type)) {
      setError({ error: "invalid_file", message: "Pick a PNG, JPEG, or WEBP image." });
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
    const img = new Image();
    img.onload = () => {
      setImageSize({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = dataUrl;
    setImageDataUrl(dataUrl);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  const cellSize = useMemo(() => {
    if (!imageSize) return null;
    return { w: imageSize.w / cols, h: imageSize.h / rows };
  }, [imageSize, rows, cols]);

  const dimensionsValid = useMemo(() => {
    if (!imageSize) return false;
    return imageSize.w % cols === 0 && imageSize.h % rows === 0;
  }, [imageSize, rows, cols]);

  const canSubmit =
    !loading &&
    imageDataUrl !== null &&
    dimensionsValid &&
    rowLabels.length === rows &&
    rowLabels.every((r) => r.action.trim().length >= 1);

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
          rows,
          cols,
          style,
          applyBackgroundRemoval: applyBg,
          bgRemoval,
          rowLabels: rowLabels.map((r) => ({
            action: r.action.trim(),
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
          Drop in a sprite sheet you made elsewhere. Specify its grid (rows × frames-per-row),
          label each row with the action it represents, and the system slices, uniform-crops,
          repacks each row as a horizontal strip, and bundles everything with Unity-importable
          manifests in one ZIP. No AI generation — just packaging.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="flex flex-col gap-4">
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="flex h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-zinc-300 bg-white text-sm text-zinc-600 hover:border-zinc-500 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            {imageDataUrl ? (
              <>
                <span className="font-medium">Replace image</span>
                <span className="text-xs">
                  {imageSize ? `${imageSize.w} × ${imageSize.h}px` : ""}
                </span>
              </>
            ) : (
              <>
                <span className="font-medium">Click or drop a sprite sheet here</span>
                <span className="text-xs">PNG, JPEG, or WEBP</span>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
              Rows (actions)
              <input
                type="number"
                min={1}
                max={12}
                value={rows}
                onChange={(e) => setRows(Math.max(1, Math.min(12, +e.target.value || 1)))}
                className="rounded-md border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
              Frames per row
              <input
                type="number"
                min={1}
                max={32}
                value={cols}
                onChange={(e) => setCols(Math.max(1, Math.min(32, +e.target.value || 1)))}
                className="rounded-md border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
          </div>

          {imageSize && (
            <p
              className={`text-xs ${
                dimensionsValid ? "text-zinc-500" : "text-amber-700 dark:text-amber-400"
              }`}
            >
              {dimensionsValid
                ? `Each cell will be ${cellSize?.w} × ${cellSize?.h}px (image ${imageSize.w} × ${imageSize.h} divided evenly).`
                : `Image (${imageSize.w} × ${imageSize.h}) is not evenly divisible by ${cols} cols × ${rows} rows. Adjust the numbers or crop the image first.`}
            </p>
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
              Label each row
            </legend>
            <datalist id="standard-actions">
              {ACTION_KEYS.map((a: ActionKey) => (
                <option key={a} value={a}>
                  {ACTION_LABELS[a]}
                </option>
              ))}
            </datalist>
            <div className="flex flex-col gap-2">
              {rowLabels.map((label, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-14 text-xs text-zinc-500">Row {i + 1}</span>
                  <input
                    type="text"
                    list="standard-actions"
                    value={label.action}
                    onChange={(e) =>
                      setRowLabels((prev) =>
                        prev.map((r, idx) =>
                          idx === i ? { ...r, action: e.target.value } : r,
                        ),
                      )
                    }
                    placeholder="e.g. attack, shield_attack, protection_spell"
                    className="flex-1 rounded-md border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={label.fpsOverride ?? ""}
                    onChange={(e) =>
                      setRowLabels((prev) =>
                        prev.map((r, idx) =>
                          idx === i
                            ? {
                                ...r,
                                fpsOverride: e.target.value ? +e.target.value : undefined,
                              }
                            : r,
                        ),
                      )
                    }
                    placeholder="fps"
                    className="w-20 rounded-md border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-zinc-500">
              Pick a standard action from the suggestions, or type any custom name (letters,
              numbers, dash, underscore, space). FPS defaults to the standard value for that
              action (or 8 for custom). Override per-row if your sheet has a specific
              playback speed in mind.
            </p>
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
          <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Preview</h3>
          <div
            className="aspect-square w-full overflow-hidden rounded-lg border border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900"
            style={{
              backgroundImage:
                "linear-gradient(45deg, #e5e5e5 25%, transparent 25%), linear-gradient(-45deg, #e5e5e5 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e5e5 75%), linear-gradient(-45deg, transparent 75%, #e5e5e5 75%)",
              backgroundSize: "20px 20px",
              backgroundPosition: "0 0, 0 10px, 10px -10px, 10px 0",
            }}
          >
            {imageDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageDataUrl}
                alt="Uploaded sprite sheet"
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">
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
                      {r.manifest.frame_count} frames @{" "}
                      {r.manifest.frame_width}×{r.manifest.frame_height}px, fps{" "}
                      {r.manifest.fps}
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
