import { removeBackground as imglyRemove } from "@imgly/background-removal-node";

/**
 * Run semantic background removal on a generated image. Returns a PNG buffer with
 * alpha=0 wherever the model thinks "background" is, regardless of color.
 *
 * Uses @imgly/background-removal-node which runs an ONNX segmentation model
 * (~25 MB) in Node via onnxruntime-node. First call on a cold container loads
 * the model (~2-5s); warm calls run in ~1-3s for a 1024x1024 image.
 *
 * Vercel deployment: next.config.ts uses serverExternalPackages +
 * outputFileTracingIncludes to ensure the onnxruntime-node Linux x64
 * libonnxruntime.so binary ships in the function bundle.
 */
export async function removeBackground(input: Buffer): Promise<Buffer> {
  const blob = new Blob([new Uint8Array(input)], { type: "image/png" });
  const out = await imglyRemove(blob, {
    output: { format: "image/png", quality: 0.95 },
  });
  return Buffer.from(await out.arrayBuffer());
}
