import type { BaseRequest, Style, ChromaColor } from "@/lib/validators";

const STYLE_INSTRUCTIONS: Record<Style, string> = {
  pixel16:
    "16-bit pixel art. Clean integer pixel grid, limited palette (~16 colors), hard edges, no anti-aliasing, no gradients, no smooth shading.",
  pixel32:
    "32-bit pixel art. Detailed pixel art with a richer palette (~32-64 colors), restrained dithering for shading, hard edges, no anti-aliasing on silhouettes.",
  cartoon:
    "2D cartoon illustration. Bold black outlines, flat fill colors, hand-drawn feel, expressive but consistent line weight.",
  modern:
    "Modern 2D illustration. Clean vector-style shapes, soft shadows, smooth gradients, contemporary game-art aesthetic.",
};

const NEGATIVE_GUIDANCE = [
  "no text",
  "no watermark",
  "no border",
  "no logo",
  "no shadow on the background",
  "no duplicate or partial characters",
  "no UI elements",
  "no captions",
].join(", ");

export interface BasePromptInput {
  description: string;
  style: Style;
  chromaColor: ChromaColor;
  palette?: string[] | undefined;
}

export function buildBasePrompt(input: BasePromptInput): string {
  const styleInstruction = STYLE_INSTRUCTIONS[input.style];

  const paletteClause = input.palette?.length
    ? `Constrain the character's colors to this palette where appropriate: ${input.palette.join(", ")}.`
    : "";

  return [
    `Generate a single character on a solid ${input.chromaColor} background.`,
    `Full body, front-facing, centered in the frame, with at least 4 pixels of clear background padding on every side.`,
    `The character must be a single subject occupying roughly 70-80% of the frame height.`,
    `Style: ${styleInstruction}`,
    paletteClause,
    `Character description: ${input.description}`,
    `Strict negative guidance: ${NEGATIVE_GUIDANCE}.`,
    `The background must be a uniform fill of exactly ${input.chromaColor} with no shading, no noise, and no anti-aliased edges where it meets the character.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Convenience overload that takes the full validated request. */
export function buildBasePromptFromRequest(req: BaseRequest): string {
  return buildBasePrompt({
    description: req.description,
    style: req.style,
    chromaColor: req.chromaColor,
    palette: req.palette,
  });
}
