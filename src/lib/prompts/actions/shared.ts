import type { Style } from "@/lib/validators";
import type { ActionPromptInput, FrameCount, GridLayout } from "./types";
import { GRID_BY_FRAME_COUNT } from "./types";

const STYLE_INSTRUCTIONS: Record<Style, string> = {
  pixel16:
    "16-bit pixel art. Clean integer pixel grid, limited palette (~16 colors), hard edges, no anti-aliasing, no gradients.",
  pixel32:
    "32-bit pixel art. Detailed pixel art with a richer palette (~32-64 colors), restrained dithering, hard edges, no anti-aliasing on silhouettes.",
  cartoon:
    "2D cartoon illustration. Bold black outlines, flat fill colors, hand-drawn feel, expressive but consistent line weight.",
  modern:
    "Modern 2D illustration. Clean vector-style shapes, soft shadows, smooth gradients, contemporary game-art aesthetic.",
};

const NEGATIVE_GUIDANCE = [
  "no text",
  "no captions",
  "no labels on cells",
  "no watermark",
  "no border around the image",
  "no separator lines or gridlines between cells",
  "no duplicate or partial characters within a single cell",
  "no UI elements",
  "no scene clutter",
].join(", ");

/** Identity-lock clause repeated in every action prompt to maximize cross-frame consistency. */
export function identityLockClause(description: string): string {
  return [
    "EVERY CELL MUST SHOW THE EXACT SAME CHARACTER.",
    "Preserve the character's face, body proportions, clothing, equipment, and color palette across every cell.",
    `The character is described as: "${description}".`,
    "The character's silhouette must remain recognizable across all cells.",
  ].join(" ");
}

export interface PoseSequence {
  /** Title of the action — appears in the prompt to set context. */
  title: string;
  /** Short one-line description of the overall motion arc. */
  motion: string;
  /** Per-cell pose strings. Length must be at least `maxFrameCount` long; we use as many as requested. */
  poses: string[];
}

function gridSpec(layout: GridLayout, frameCount: FrameCount): string {
  return `Compose a ${layout.cols}x${layout.rows} grid of ${frameCount} cells, arranged left-to-right then top-to-bottom. Every cell is the same size and shows the same character at a different moment in the animation. The grid has no visible borders or dividers between cells — only the chroma-key background fills the inter-cell space.`;
}

function paletteClause(palette: string[] | undefined): string {
  if (!palette || palette.length === 0) return "";
  return `Constrain the character's colors to this palette where appropriate: ${palette.join(", ")}.`;
}

/**
 * Compose an action prompt from a pose sequence + the shared identity/style/bg constraints.
 * Used by every action's buildXxxPrompt function so the cross-cutting structure stays uniform.
 */
export function buildActionPrompt(
  input: ActionPromptInput,
  sequence: PoseSequence,
): string {
  const layout = GRID_BY_FRAME_COUNT[input.frameCount];
  const poses = sequence.poses.slice(0, input.frameCount);
  const numbered = poses
    .map((p, i) => `Cell ${i + 1}: ${p}`)
    .join("\n");

  return [
    `Animation reference sheet for the character's ${sequence.title} cycle.`,
    `Motion: ${sequence.motion}.`,
    gridSpec(layout, input.frameCount),
    `Background: a solid uniform fill of exactly ${input.chromaColor} in every cell. No shading, no gradient, no noise. The same exact color in every cell and in the inter-cell space.`,
    `Style: ${STYLE_INSTRUCTIONS[input.style]}`,
    paletteClause(input.palette),
    identityLockClause(input.description),
    `Per-cell poses (front-facing unless specified otherwise):`,
    numbered,
    `Strict negative guidance: ${NEGATIVE_GUIDANCE}.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
