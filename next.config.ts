import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tell webpack not to try to bundle these — they carry native bindings and
  // large asset files that must be loaded from node_modules at runtime.
  serverExternalPackages: [
    "@imgly/background-removal-node",
    "onnxruntime-node",
    "sharp",
  ],

  // Vercel's serverless tracer follows static require() chains but does not
  // see dlopen() of libonnxruntime.so or @imgly's bundled .onnx model files.
  // Explicitly include everything onnxruntime-node and @imgly ship so the
  // function bundle has the Linux x64 binary at runtime.
  outputFileTracingIncludes: {
    "/api/generate-base": [
      "./node_modules/@imgly/background-removal-node/dist/**",
      "./node_modules/.pnpm/@imgly+background-removal-node@*/node_modules/@imgly/background-removal-node/dist/**",
      "./node_modules/onnxruntime-node/bin/**",
      "./node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node/bin/**",
    ],
    "/api/generate-action": [
      "./node_modules/@imgly/background-removal-node/dist/**",
      "./node_modules/.pnpm/@imgly+background-removal-node@*/node_modules/@imgly/background-removal-node/dist/**",
      "./node_modules/onnxruntime-node/bin/**",
      "./node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node/bin/**",
    ],
  },
};

export default nextConfig;
