"use client";

import { useEffect, useState } from "react";
import {
  ACTION_KEYS,
  ACTION_LABELS,
  ACTION_DESCRIPTIONS,
  DEFAULT_FPS_BY_ACTION,
  FRAME_COUNTS,
  type ActionKey,
  type FrameCount,
} from "@/lib/prompts/actions";
import type {
  ActionResponse,
  BaseResponse,
  BgRemovalStrength,
  ChromaColor,
  QualityMode,
  Style,
} from "@/lib/validators";
import type { ProviderId } from "@/lib/providers/types";

const SESSION_KEY_BASE = "spriteCreator.baseCharacter";
const SESSION_KEY_ACTIONS = "spriteCreator.actions";

interface PersistedBase {
  request: {
    description: string;
    style: Style;
    chromaColor: ChromaColor;
    provider: ProviderId;
    seed?: number;
    bgRemoval?: BgRemovalStrength;
  };
  response: BaseResponse;
}

interface PersistedActions {
  [action: string]: {
    frameCount: FrameCount;
    qualityMode: QualityMode;
    response: ActionResponse;
  };
}

const QUALITY_MODE_OPTIONS: Array<{
  value: QualityMode;
  label: string;
  hint: string;
}> = [
  {
    value: "careful",
    label: "Careful (recommended)",
    hint: "One model call per frame, same seed, single focused pose. ~4-8x slower but the character stays the same across frames. Capped at 9 frames.",
  },
  {
    value: "fast",
    label: "Fast",
    hint: "One model call generates a whole NxN grid. ~9s total. Character identity drifts between cells. Auto-used for 16-frame sheets.",
  },
];

interface ApiError {
  error: string;
  message?: string;
  provider?: ProviderId;
}

export function ActionPanel() {
  const [base, setBase] = useState<PersistedBase | null>(null);
  const [actions, setActions] = useState<PersistedActions>({});
  const [selectedAction, setSelectedAction] = useState<ActionKey>("walk");
  const [frameCount, setFrameCount] = useState<FrameCount>(4);
  const [qualityMode, setQualityMode] = useState<QualityMode>("careful");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [zipping, setZipping] = useState(false);

  useEffect(() => {
    try {
      const storedBase = sessionStorage.getItem(SESSION_KEY_BASE);
      if (storedBase) setBase(JSON.parse(storedBase) as PersistedBase);
      const storedActions = sessionStorage.getItem(SESSION_KEY_ACTIONS);
      if (storedActions) setActions(JSON.parse(storedActions) as PersistedActions);
    } catch {
      // ignore malformed sessionStorage
    }
  }, []);

  // Poll sessionStorage so the panel reactively unlocks when the user accepts a base.
  useEffect(() => {
    const tick = () => {
      try {
        const stored = sessionStorage.getItem(SESSION_KEY_BASE);
        if (stored) {
          const parsed = JSON.parse(stored) as PersistedBase;
          setBase((prev) =>
            prev?.response.meta.generatedAt === parsed.response.meta.generatedAt ? prev : parsed,
          );
        } else if (base) {
          setBase(null);
          setActions({});
        }
      } catch {
        // ignore
      }
    };
    const t = setInterval(tick, 800);
    return () => clearInterval(t);
  }, [base]);

  function persistActions(next: PersistedActions) {
    setActions(next);
    sessionStorage.setItem(SESSION_KEY_ACTIONS, JSON.stringify(next));
  }

  async function handleGenerate() {
    if (!base) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/generate-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: base.request.description,
          style: base.request.style,
          chromaColor: base.request.chromaColor,
          bgRemoval: base.request.bgRemoval ?? "balanced",
          provider: base.request.provider,
          action: selectedAction,
          frameCount,
          qualityMode,
          baseImage: base.response.image,
          seed: base.request.seed ?? base.response.meta.seed,
        }),
      });
      const body = (await res.json()) as ActionResponse | ApiError;
      if (!res.ok) {
        setError(body as ApiError);
        return;
      }
      persistActions({
        ...actions,
        [selectedAction]: {
          frameCount,
          qualityMode,
          response: body as ActionResponse,
        },
      });
    } catch (err) {
      setError({
        error: "network_error",
        message: err instanceof Error ? err.message : "Network request failed.",
      });
    } finally {
      setLoading(false);
    }
  }

  function handleClearAction(action: ActionKey) {
    const { [action]: _removed, ...rest } = actions;
    void _removed;
    persistActions(rest);
  }

  async function handleDownloadZip() {
    if (!base) return;
    setZipping(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();

      const baseBase64 = base.response.image.split(",", 2)[1] ?? "";
      zip.file("character_base.png", baseBase64, { base64: true });
      zip.file(
        "character_base.json",
        JSON.stringify(
          { ...base.response.meta, description: base.request.description },
          null,
          2,
        ),
      );

      for (const [key, entry] of Object.entries(actions)) {
        const sheetB64 = entry.response.sheet.split(",", 2)[1] ?? "";
        zip.file(`${key}.png`, sheetB64, { base64: true });
        zip.file(`${key}.json`, JSON.stringify(entry.response.manifest, null, 2));
      }

      zip.file("UNITY_IMPORT.txt", buildImportInstructions(Object.keys(actions) as ActionKey[]));

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sprite-creator-${slugify(base.request.description)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setZipping(false);
    }
  }

  if (!base) {
    return null;
  }

  const generatedKeys = Object.keys(actions) as ActionKey[];
  const fps = DEFAULT_FPS_BY_ACTION[selectedAction];
  const currentSheet = actions[selectedAction];

  return (
    <section className="mt-12 w-full max-w-5xl border-t border-zinc-200 pt-8 dark:border-zinc-800">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Action sprite sheets
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Generate animated cycles for the accepted base character. Each generated sheet plays
            back at its action&apos;s default FPS and imports into Unity with the JSON manifest.
          </p>
        </div>
        <button
          type="button"
          onClick={handleDownloadZip}
          disabled={zipping}
          className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-300"
        >
          {zipping ? "Packaging…" : `Download all (${generatedKeys.length + 1} files)`}
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Action</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {ACTION_KEYS.map((a) => {
                const isGenerated = Boolean(actions[a]);
                const isSelected = a === selectedAction;
                return (
                  <label
                    key={a}
                    className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition-colors ${
                      isSelected
                        ? "border-zinc-900 bg-zinc-50 dark:border-zinc-50 dark:bg-zinc-900"
                        : "border-zinc-300 hover:border-zinc-500 dark:border-zinc-700 dark:hover:border-zinc-500"
                    }`}
                  >
                    <input
                      type="radio"
                      name="action"
                      value={a}
                      checked={isSelected}
                      onChange={() => setSelectedAction(a)}
                      className="sr-only"
                    />
                    <span className="flex items-center justify-between text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {ACTION_LABELS[a]}
                      {isGenerated && (
                        <span aria-label="generated" className="text-emerald-700 dark:text-emerald-400">
                          ✓
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">
                      {ACTION_DESCRIPTIONS[a]}
                    </span>
                    <span className="text-xs text-zinc-500">
                      Default FPS {DEFAULT_FPS_BY_ACTION[a]}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Frame count
            </legend>
            <div className="flex gap-2">
              {FRAME_COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setFrameCount(n)}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                    frameCount === n
                      ? "border-zinc-900 bg-zinc-50 dark:border-zinc-50 dark:bg-zinc-900"
                      : "border-zinc-300 dark:border-zinc-700"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-500">
              {frameCount === 4 && "4 frames — fastest to generate"}
              {frameCount === 8 && "8 frames — smoother walk/run cycles"}
              {frameCount === 9 && "9 frames — balanced cycle and one-shot length"}
              {frameCount === 16 && "16 frames — most fluid; auto-uses Fast mode to stay under the timeout"}
            </p>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Quality mode
            </legend>
            <div className="flex gap-2">
              {QUALITY_MODE_OPTIONS.map((opt) => {
                const forcedFast = frameCount === 16 && opt.value === "careful";
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setQualityMode(opt.value)}
                    disabled={forcedFast}
                    className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors disabled:opacity-50 ${
                      qualityMode === opt.value && !forcedFast
                        ? "border-zinc-900 bg-zinc-50 dark:border-zinc-50 dark:bg-zinc-900"
                        : "border-zinc-300 dark:border-zinc-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-zinc-500">
              {QUALITY_MODE_OPTIONS.find((o) => o.value === qualityMode)?.hint}
            </p>
            <p className="text-xs text-zinc-500">
              <strong>Careful</strong> generates each frame as its own image so the model
              can&apos;t accidentally render four different characters in one grid. Use this
              when actions look wonky or identity drifts between frames.
            </p>
          </fieldset>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="rounded-lg bg-zinc-900 py-3 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:disabled:bg-zinc-700"
          >
            {loading
              ? `Generating ${ACTION_LABELS[selectedAction]}…`
              : currentSheet
                ? `Regenerate ${ACTION_LABELS[selectedAction]}`
                : `Generate ${ACTION_LABELS[selectedAction]}`}
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Preview: {ACTION_LABELS[selectedAction]}
          </h3>
          <div
            className="aspect-square w-full overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700"
            style={{
              backgroundImage:
                "linear-gradient(45deg, #e5e5e5 25%, transparent 25%), linear-gradient(-45deg, #e5e5e5 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e5e5 75%), linear-gradient(-45deg, transparent 75%, #e5e5e5 75%)",
              backgroundSize: "20px 20px",
              backgroundPosition: "0 0, 0 10px, 10px -10px, 10px 0",
            }}
          >
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-zinc-600">
                <div className="flex flex-col items-center gap-2">
                  <div
                    aria-hidden
                    className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700"
                  />
                  <span>Generating {ACTION_LABELS[selectedAction]} sheet…</span>
                </div>
              </div>
            ) : currentSheet ? (
              <SpriteAnimation
                sheet={currentSheet.response.sheet}
                frameCount={currentSheet.response.manifest.frame_count}
                frameWidth={currentSheet.response.manifest.frame_width}
                frameHeight={currentSheet.response.manifest.frame_height}
                fps={fps}
              />
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-500">
                Pick a frame count and click Generate. The animated cycle will preview here.
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

          {currentSheet && (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              {currentSheet.response.manifest.frame_quality &&
                currentSheet.response.manifest.frame_quality.some((q) => q !== "ok") && (
                  <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    <p className="font-medium">Some frames look off.</p>
                    <p className="mt-1">
                      Frame quality:{" "}
                      {currentSheet.response.manifest.frame_quality
                        .map((q, i) => `#${i + 1} ${q.replace("_", " ")}`)
                        .join(" · ")}
                      . Hit Regenerate above for a cleaner roll.
                    </p>
                  </div>
                )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <dt className="font-medium text-zinc-500">Frames</dt>
                  <dd>{currentSheet.response.manifest.frame_count}</dd>
                </div>
                <div>
                  <dt className="font-medium text-zinc-500">FPS</dt>
                  <dd>{currentSheet.response.manifest.fps}</dd>
                </div>
                <div>
                  <dt className="font-medium text-zinc-500">Frame size</dt>
                  <dd>
                    {currentSheet.response.manifest.frame_width} ×{" "}
                    {currentSheet.response.manifest.frame_height} px
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-zinc-500">Grid for Unity</dt>
                  <dd>
                    {currentSheet.response.manifest.columns} × {currentSheet.response.manifest.rows}
                  </dd>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <a
                  href={currentSheet.response.sheet}
                  download={`${selectedAction}.png`}
                  className="rounded-md bg-zinc-900 px-3 py-1.5 font-medium text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                >
                  Download PNG
                </a>
                <a
                  href={`data:application/json;base64,${btoa(
                    JSON.stringify(currentSheet.response.manifest, null, 2),
                  )}`}
                  download={`${selectedAction}.json`}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-medium text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  Download manifest
                </a>
                <button
                  type="button"
                  onClick={() => handleClearAction(selectedAction)}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-medium text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function SpriteAnimation(props: {
  sheet: string;
  frameCount: number;
  frameWidth: number;
  frameHeight: number;
  fps: number;
}) {
  const { sheet, frameCount, frameWidth, frameHeight, fps } = props;
  const durationSec = frameCount / fps;
  const animationName = `sprite-anim-${frameCount}-${frameWidth}`;

  const styles = `
    @keyframes ${animationName} {
      from { background-position: 0 0; }
      to   { background-position: -${frameWidth * frameCount}px 0; }
    }
  `;

  return (
    <div className="flex h-full items-center justify-center">
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <div
        aria-label="Animated sprite preview"
        role="img"
        style={{
          width: `${frameWidth}px`,
          height: `${frameHeight}px`,
          maxWidth: "90%",
          maxHeight: "90%",
          backgroundImage: `url("${sheet}")`,
          backgroundRepeat: "no-repeat",
          backgroundSize: `${frameWidth * frameCount}px ${frameHeight}px`,
          imageRendering: "pixelated",
          animation: `${animationName} ${durationSec}s steps(${frameCount}) infinite`,
        }}
      />
    </div>
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 40);
}

function buildImportInstructions(generated: ActionKey[]): string {
  const actions = generated.length
    ? generated.map((a) => `  - ${a}.png + ${a}.json`).join("\n")
    : "  (no action sheets generated yet)";
  return `Sprite Creator — Unity 6 import guide
=====================================

What you got:
  - character_base.png        Single transparent PNG of the base character
  - character_base.json       Style + PPU metadata for the base
${actions}

For the base character:
  1. Drag character_base.png into your Unity project's Assets folder
  2. Select the asset. In Inspector, verify Texture Type = Sprite (2D and UI)
  3. Pixels Per Unit: read from character_base.json -> pixels_per_unit
  4. Filter Mode: Point (no filter) for pixel styles, Bilinear for cartoon/modern
  5. Compression: None for pixel styles (preserves palette)
  6. Click Apply

For each action sprite sheet:
  1. Drag the .png into Assets
  2. Inspector: Sprite Mode = Multiple
  3. Open Sprite Editor
  4. Slice -> Type: Grid By Cell Count
       Columns = manifest.columns
       Rows    = manifest.rows
  5. Slice, Apply, Close
  6. Expand the asset in Project window -> select all sub-sprites
  7. Drag them into a scene to auto-create an Animation Clip
  8. In Animation window, set Samples (frame rate) = manifest.fps

Repeat for every action. To combine into one Animator:
  - Open the auto-created Animator Controller
  - Drag each additional clip into the Animator window as states
  - Add transitions with parameter conditions (Speed float, isGrounded bool, etc.)

License: MIT. https://github.com/CarCar47/sprite-creator
`;
}
