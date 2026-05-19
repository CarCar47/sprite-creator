import { z } from "zod";
import { PROVIDER_IDS, type ProviderId } from "@/lib/providers/types";
import { ACTION_KEYS, type ActionKey } from "@/lib/prompts/actions/types";
import type { SpriteManifest } from "@/lib/manifest";

export const StyleSchema = z.enum(["pixel16", "pixel32", "cartoon", "modern"]);
export type Style = z.infer<typeof StyleSchema>;

export const ChromaColorSchema = z.enum(["#00FF00", "#FF00FF"]);
export type ChromaColor = z.infer<typeof ChromaColorSchema>;

export const BgRemovalStrengthSchema = z.enum([
  "none",
  "minimal",
  "gentle",
  "balanced",
  "aggressive",
]);
export type BgRemovalStrength = z.infer<typeof BgRemovalStrengthSchema>;

export const ProviderIdSchema = z.enum(PROVIDER_IDS);

export const HexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "must be a 6-digit hex color like #1A2B3C");

export const BaseRequestSchema = z.object({
  description: z
    .string()
    .trim()
    .min(10, "description must be at least 10 characters")
    .max(500, "description must be at most 500 characters"),
  style: StyleSchema,
  palette: z.array(HexColorSchema).max(8).optional(),
  chromaColor: ChromaColorSchema.default("#00FF00"),
  provider: ProviderIdSchema.optional(),
  bgRemoval: BgRemovalStrengthSchema.default("balanced"),
  /** Optional integer seed. Useful when re-rolling with the same prompt to compare variants
   *  or for clients that want to lock in a seed for cross-action identity preservation. */
  seed: z.number().int().nonnegative().optional(),
  /** Optional refinement clause appended after the main description ("make the eyes blue
   *  instead of red", etc.). The seed is typically reused so non-targeted features stay
   *  close to the previous generation. */
  refinement: z.string().trim().max(200).optional(),
});
export type BaseRequest = z.infer<typeof BaseRequestSchema>;

export interface BaseResponseMeta {
  width: number;
  height: number;
  generatedAt: string;
  model: string;
  provider: ProviderId;
  ppu: number;
  style: Style;
  /** The seed actually used. Always non-null in the response so the client can pass it
   *  to subsequent action calls for cross-frame consistency. */
  seed: number;
}

export interface BaseResponse {
  image: string;
  meta: BaseResponseMeta;
}

export const ActionKeySchema = z.enum(ACTION_KEYS);
export const FrameCountSchema = z.union([
  z.literal(4),
  z.literal(8),
  z.literal(9),
  z.literal(16),
]);

export const QualityModeSchema = z.enum(["fast", "careful"]);
export type QualityMode = z.infer<typeof QualityModeSchema>;

const DataUrlPngSchema = z
  .string()
  .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, "must be a data:image/png;base64,... URL");

export const ActionRequestSchema = z.object({
  description: z
    .string()
    .trim()
    .min(10, "description must be at least 10 characters")
    .max(500, "description must be at most 500 characters"),
  style: StyleSchema,
  chromaColor: ChromaColorSchema.default("#00FF00"),
  palette: z.array(HexColorSchema).max(8).optional(),
  provider: ProviderIdSchema.optional(),
  bgRemoval: BgRemovalStrengthSchema.default("balanced"),
  action: ActionKeySchema,
  frameCount: FrameCountSchema,
  baseImage: DataUrlPngSchema,
  /** Optional integer seed reused from the base generation for cross-frame identity. */
  seed: z.number().int().nonnegative().optional(),
  /** 'fast' = one grid call (legacy). 'careful' = N independent per-frame calls with the
   *  same seed and a focused single-pose prompt; preserves character identity dramatically
   *  better at the cost of being N times slower. */
  qualityMode: QualityModeSchema.default("careful"),
});
export type ActionRequest = z.infer<typeof ActionRequestSchema>;

export interface ActionResponse {
  sheet: string;
  manifest: SpriteManifest;
}

export type { ActionKey };

// ───── Sprite Importer ─────

const DataUrlAnyImageSchema = z
  .string()
  .regex(
    /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/,
    "must be a data:image/* base64 URL",
  );

export const ImportRectSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
});
export type ImportRect = z.infer<typeof ImportRectSchema>;

export const ImportRowSchema = z.object({
  action: z
    .string()
    .trim()
    .min(1, "action label required")
    .max(40, "action label max 40 characters")
    .regex(/^[a-zA-Z0-9_\- ]+$/, "letters, numbers, dash, underscore, space only"),
  rect: ImportRectSchema,
  frameCount: z.number().int().min(1).max(32),
  fpsOverride: z.number().int().min(1).max(60).optional(),
  pivot: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
    })
    .optional(),
});

export const ImportRequestSchema = z.object({
  image: DataUrlAnyImageSchema,
  style: StyleSchema.default("pixel32"),
  applyBackgroundRemoval: z.boolean().default(false),
  chromaColor: ChromaColorSchema.default("#00FF00"),
  bgRemoval: BgRemovalStrengthSchema.default("balanced"),
  rows: z.array(ImportRowSchema).min(1).max(20),
});
export type ImportRequest = z.infer<typeof ImportRequestSchema>;

export interface ImportedRow {
  action: string;
  sheet: string;
  manifest: import("@/lib/manifest").SpriteManifest;
}

export interface ImportResponse {
  rows: ImportedRow[];
}

export const STYLE_LABELS: Record<Style, string> = {
  pixel16: "Pixel Art 16-bit",
  pixel32: "Pixel Art 32-bit",
  cartoon: "2D Cartoon",
  modern: "Modern 2D",
};

export const STYLE_DESCRIPTIONS: Record<Style, string> = {
  pixel16: "Clean integer pixel grid, ~16-color palette, no anti-aliasing",
  pixel32: "Detailed pixel art with rich palette (~32-64 colors)",
  cartoon: "Bold outlines, flat colors, hand-drawn feel",
  modern: "Clean vector look, soft shadows, smooth gradients",
};

export const PPU_BY_STYLE: Record<Style, number> = {
  pixel16: 16,
  pixel32: 32,
  cartoon: 100,
  modern: 100,
};

export const FILTER_MODE_BY_STYLE: Record<Style, "Point" | "Bilinear"> = {
  pixel16: "Point",
  pixel32: "Point",
  cartoon: "Bilinear",
  modern: "Bilinear",
};
