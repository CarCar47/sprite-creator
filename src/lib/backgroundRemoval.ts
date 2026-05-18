import { adaptiveBackgroundKey } from "@/lib/chromaKey";
import type { ChromaColor } from "@/lib/validators";

/**
 * Remove the background of a generated image and return a PNG with proper alpha.
 *
 * Implementation: adaptive chroma key. Detects the actual background color by sampling
 * the four image corners, then chroma-keys with a wide tolerance and 2-pixel alpha
 * erosion. This handles the common case where free image-gen models ignore the
 * "render a solid #00FF00 background" instruction and produce a slightly different
 * uniform color (or close to it) on their own.
 *
 * We tried @imgly/background-removal-node (semantic segmentation, ~25 MB ONNX model)
 * but its deployment requires onnxruntime-node, whose 5-platform native binaries
 * push the Vercel function bundle over 300 MB. The adaptive chroma approach gets us
 * ~95% of the quality with zero runtime deps.
 */
export async function removeBackground(
  input: Buffer,
  chromaHint?: ChromaColor | string,
): Promise<Buffer> {
  return adaptiveBackgroundKey(input, chromaHint, { tolerance: 100, defringe: 2 });
}
