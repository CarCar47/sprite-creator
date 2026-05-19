import { createHash } from "node:crypto";
import {
  DEFAULT_FPS_BY_ACTION,
  type ActionKey,
} from "@/lib/prompts/actions";
import {
  FILTER_MODE_BY_STYLE,
  PPU_BY_STYLE,
  type Style,
} from "@/lib/validators";
import type { ProviderId } from "@/lib/providers/types";
import type { FrameQuality } from "@/lib/spriteSheet";

export interface SpriteManifest {
  /** Total number of frames in the horizontal strip. */
  frame_count: number;
  /** Width of every individual frame, in pixels. */
  frame_width: number;
  /** Height of every individual frame, in pixels. */
  frame_height: number;
  /** After horizontal repack, columns equal frame_count and rows is always 1. */
  columns: number;
  rows: number;
  /** Suggested Unity Animation Clip Samples value (frames per second). */
  fps: number;
  /** Sprite pivot point. (0.5, 0.5) is centered; (0.5, 0) is bottom-centered. */
  pivot: { x: number; y: number };
  /** Unity Pixels Per Unit. Matches the engineering plan's mapping per style. */
  pixels_per_unit: number;
  /** Hint for Unity's Filter Mode setting. */
  filter_mode_hint: "Point" | "Bilinear";
  /** ISO timestamp the sheet was generated. */
  generated_at: string;
  /** Provider-reported model id (e.g. "black-forest-labs/FLUX.1-schnell"), or
   *  "imported" for sheets packaged from a user-uploaded image. */
  model_version: string;
  /** Provider id (huggingface | pollinations | gemini), or "import" for sheets packaged
   *  from a user-uploaded image rather than AI-generated. */
  provider: ProviderId | "import";
  /** SHA-256 (first 16 hex chars) of the full prompt used for traceability. The full prompt itself is never logged. */
  prompt_hash: string;
  /** Action label. May be one of the 7 standard ActionKey values OR a free-text custom
   *  action name from the sprite importer feature (e.g. "shield_attack", "protection_spell"). */
  action: ActionKey | string;
  /** Style key — useful when re-importing a single asset. */
  style: Style;
  /** Per-frame quality flag. Frames marked anything but "ok" had unusually low or high
   *  opaque-pixel counts compared to the median — usually the model failed to draw the
   *  character (low_alpha) or bled into a neighboring cell (high_alpha). Clients can
   *  surface this as a regenerate prompt. */
  frame_quality?: FrameQuality[];
}

export interface ManifestInput {
  frameCount: number;
  frameWidth: number;
  frameHeight: number;
  action: ActionKey | string;
  style: Style;
  provider: ProviderId | "import";
  modelVersion: string;
  prompt: string;
  frameQuality?: FrameQuality[];
  fpsOverride?: number;
  pivotOverride?: { x: number; y: number };
}

export function shortPromptHash(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex").slice(0, 16);
}

export function buildManifest(input: ManifestInput): SpriteManifest {
  const standardFps = isStandardAction(input.action)
    ? DEFAULT_FPS_BY_ACTION[input.action]
    : 8;
  return {
    frame_count: input.frameCount,
    frame_width: input.frameWidth,
    frame_height: input.frameHeight,
    columns: input.frameCount,
    rows: 1,
    fps: input.fpsOverride ?? standardFps,
    pivot: input.pivotOverride ?? { x: 0.5, y: 0.5 },
    pixels_per_unit: PPU_BY_STYLE[input.style],
    filter_mode_hint: FILTER_MODE_BY_STYLE[input.style],
    generated_at: new Date().toISOString(),
    model_version: input.modelVersion,
    provider: input.provider as SpriteManifest["provider"],
    prompt_hash: shortPromptHash(input.prompt),
    action: input.action,
    style: input.style,
    ...(input.frameQuality ? { frame_quality: input.frameQuality } : {}),
  };
}

function isStandardAction(action: string): action is ActionKey {
  return (
    action === "idle" ||
    action === "walk" ||
    action === "run" ||
    action === "jump" ||
    action === "attack" ||
    action === "hurt" ||
    action === "death"
  );
}
