import { z } from "zod";
import { PROVIDER_IDS, type ProviderId } from "@/lib/providers/types";
import { ACTION_KEYS, type ActionKey } from "@/lib/prompts/actions/types";
import type { SpriteManifest } from "@/lib/manifest";

export const StyleSchema = z.enum(["pixel16", "pixel32", "cartoon", "modern"]);
export type Style = z.infer<typeof StyleSchema>;

export const ChromaColorSchema = z.enum(["#00FF00", "#FF00FF"]);
export type ChromaColor = z.infer<typeof ChromaColorSchema>;

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
  /** Optional integer seed. Useful when re-rolling with the same prompt to compare variants
   *  or for clients that want to lock in a seed for cross-action identity preservation. */
  seed: z.number().int().nonnegative().optional(),
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
  action: ActionKeySchema,
  frameCount: FrameCountSchema,
  baseImage: DataUrlPngSchema,
  /** Optional integer seed reused from the base generation for cross-frame identity. */
  seed: z.number().int().nonnegative().optional(),
});
export type ActionRequest = z.infer<typeof ActionRequestSchema>;

export interface ActionResponse {
  sheet: string;
  manifest: SpriteManifest;
}

export type { ActionKey };

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
