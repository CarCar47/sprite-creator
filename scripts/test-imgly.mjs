// One-off smoke test: feed the existing HF sample PNG through @imgly
// and write the result to docs/. Run with: node scripts/test-imgly.mjs
import { removeBackground } from "@imgly/background-removal-node";
import { readFile, writeFile } from "node:fs/promises";

const INPUT = "docs/phase1.5-hf-sample.png";
const OUTPUT = "docs/phase1.6-imgly-sample.png";

const start = Date.now();
console.log(`Loading ${INPUT}…`);
const input = await readFile(INPUT);
const blob = new Blob([input], { type: "image/png" });

console.log("Running @imgly removeBackground (first run downloads ~25MB model to OS cache)…");
const result = await removeBackground(blob, {
  output: { format: "image/png", quality: 0.95 },
});
const buffer = Buffer.from(await result.arrayBuffer());
await writeFile(OUTPUT, buffer);

console.log(`Wrote ${OUTPUT} (${buffer.byteLength} bytes) in ${Date.now() - start}ms`);
