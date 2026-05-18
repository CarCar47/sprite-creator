import { z } from "zod";

export const StyleSchema = z.enum(["pixel16", "pixel32", "cartoon", "modern"]);
export type Style = z.infer<typeof StyleSchema>;

export const ChromaColorSchema = z.enum(["#00FF00", "#FF00FF"]);
export type ChromaColor = z.infer<typeof ChromaColorSchema>;

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
});
export type BaseRequest = z.infer<typeof BaseRequestSchema>;

export interface BaseResponseMeta {
  width: number;
  height: number;
  generatedAt: string;
  model: string;
  ppu: number;
  style: Style;
}

export interface BaseResponse {
  image: string;
  meta: BaseResponseMeta;
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
