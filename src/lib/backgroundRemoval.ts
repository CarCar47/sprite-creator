import { chromaKeyToAlpha } from "@/lib/chromaKey";
import type { ChromaColor } from "@/lib/validators";

/**
 * Remove the background of a generated image and return a PNG with proper alpha.
 *
 * Strategy: chroma-key against the prompt-hinted background color (the same color
 * the prompt told the model to render — #00FF00 by default, #FF00FF for green-
 * dominant characters), with a moderate tolerance and 2-pass alpha erosion to
 * shave the silhouette halo without eating subject pixels.
 *
 * Tuning history:
 *   tol=60 defringe=1  → visible halo around silhouette (Phase 1.5 baseline)
 *   adaptive corner-sample tol=100 → too aggressive on subject-colored
 *     backgrounds (ate the dragon body)
 *   tol=70 defringe=2  → current default; clean silhouette without subject loss
 *
 * Semantic segmentation via @imgly was tried but ruled out:
 *   - @imgly/background-removal-node + onnxruntime-node: 380 MB function bundle
 *     exceeded Vercel's 300 MB hard limit (5 platforms of binaries bundled).
 *   - @imgly/background-removal (WASM): Node ESM loader rejects the blob: URL
 *     the package uses to load its WASM module.
 *
 * For action sprite-sheet frames (Phase 2) where the model produces a 2x2 / 3x3
 * grid against a uniform background, the chroma approach is actually well-suited:
 * the bg color is consistent across all cells, so the same tolerance applies
 * uniformly across the grid.
 */
export async function removeBackground(
  input: Buffer,
  chromaHint: ChromaColor | string,
): Promise<Buffer> {
  return chromaKeyToAlpha(input, chromaHint, {
    tolerance: 70,
    defringe: 2,
  });
}
