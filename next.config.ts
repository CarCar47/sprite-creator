import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pack onnxruntime-node and @imgly/background-removal-node at runtime instead of
  // through webpack — both ship native .node bindings and large model files that
  // would otherwise be tree-shaken or fail to load in serverless functions.
  serverExternalPackages: [
    "@imgly/background-removal-node",
    "onnxruntime-node",
    "sharp",
  ],
};

export default nextConfig;
