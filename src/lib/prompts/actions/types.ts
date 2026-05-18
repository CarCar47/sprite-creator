import type { ChromaColor, Style } from "@/lib/validators";

export const ACTION_KEYS = [
  "idle",
  "walk",
  "run",
  "jump",
  "attack",
  "hurt",
  "death",
] as const;
export type ActionKey = (typeof ACTION_KEYS)[number];

export const FRAME_COUNTS = [4, 8, 9, 16] as const;
export type FrameCount = (typeof FRAME_COUNTS)[number];

export interface GridLayout {
  cols: number;
  rows: number;
}

export const GRID_BY_FRAME_COUNT: Record<FrameCount, GridLayout> = {
  4: { cols: 2, rows: 2 },
  8: { cols: 4, rows: 2 },
  9: { cols: 3, rows: 3 },
  16: { cols: 4, rows: 4 },
};

/** Per-action default playback speed for the Unity AnimationClip Samples field. */
export const DEFAULT_FPS_BY_ACTION: Record<ActionKey, number> = {
  idle: 4,
  walk: 8,
  run: 12,
  jump: 10,
  attack: 8,
  hurt: 4,
  death: 4,
};

export const ACTION_LABELS: Record<ActionKey, string> = {
  idle: "Idle",
  walk: "Walk",
  run: "Run",
  jump: "Jump",
  attack: "Attack",
  hurt: "Hurt",
  death: "Death",
};

export const ACTION_DESCRIPTIONS: Record<ActionKey, string> = {
  idle: "Standing still with small breathing motion",
  walk: "Forward walking cycle, full stride",
  run: "Fast running cycle, longer stride and lean",
  jump: "Crouch, leap, midair, landing recovery",
  attack: "Wind-up, strike, follow-through, reset",
  hurt: "Recoil from a hit and stagger back",
  death: "Knockback into a fallen pose",
};

export interface ActionPromptInput {
  description: string;
  style: Style;
  chromaColor: ChromaColor;
  frameCount: FrameCount;
  palette?: string[] | undefined;
}
