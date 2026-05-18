import { InferenceClient } from "@huggingface/inference";
import { ProviderError, type ImageGenOpts, type ImageProvider } from "./types";

const DEFAULT_MODEL = "black-forest-labs/FLUX.1-schnell";

function aspectToWH(
  aspect: ImageGenOpts["aspectRatio"],
  size: ImageGenOpts["imageSize"],
): { width: number; height: number } {
  const base = size === "2K" ? 2048 : 1024;
  switch (aspect) {
    case "16:9":
      return { width: base, height: Math.round((base * 9) / 16) };
    case "9:16":
      return { width: Math.round((base * 9) / 16), height: base };
    case "4:3":
      return { width: base, height: Math.round((base * 3) / 4) };
    case "3:4":
      return { width: Math.round((base * 3) / 4), height: base };
    case "1:1":
    default:
      return { width: base, height: base };
  }
}

let _client: InferenceClient | null = null;
function getClient(): InferenceClient {
  if (!_client) {
    const token = process.env.HF_TOKEN;
    if (!token) {
      throw new ProviderError("HF_TOKEN is not configured", "unavailable", "huggingface");
    }
    _client = new InferenceClient(token);
  }
  return _client;
}

async function callHuggingFace(prompt: string, opts: ImageGenOpts): Promise<Buffer> {
  const client = getClient();
  const model = process.env.HUGGINGFACE_MODEL ?? DEFAULT_MODEL;
  const { width, height } = aspectToWH(opts.aspectRatio, opts.imageSize);

  let blob: Blob;
  try {
    blob = await client.textToImage(
      {
        model,
        inputs: prompt,
        parameters: {
          width,
          height,
          num_inference_steps: 4,
          ...(typeof opts.seed === "number" ? { seed: opts.seed } : {}),
        },
      },
      {
        signal: opts.signal,
      },
    );
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ProviderError("HuggingFace request was aborted", "timeout", "huggingface");
    }
    const message = err instanceof Error ? err.message : String(err);

    if (/401|403|unauthorized|forbidden/i.test(message)) {
      throw new ProviderError(
        "HuggingFace rejected the token. Recreate at https://huggingface.co/settings/tokens with 'Make calls to Inference Providers' permission, then re-set HF_TOKEN.",
        "auth",
        "huggingface",
      );
    }

    if (/429|rate.?limit|too many/i.test(message)) {
      throw new ProviderError(
        "HuggingFace rate limit hit. Wait, switch providers, or upgrade your HF account.",
        "rate_limit",
        "huggingface",
      );
    }

    if (/quota|credits|exhausted|payment required|402/i.test(message)) {
      throw new ProviderError(
        "HuggingFace monthly free credits exhausted. Wait until next month, upgrade to PRO, or switch to Pollinations.",
        "rate_limit",
        "huggingface",
      );
    }

    throw new ProviderError(
      `HuggingFace upstream error: ${message}`,
      "upstream",
      "huggingface",
    );
  }

  if (!blob || blob.size === 0) {
    throw new ProviderError("HuggingFace returned an empty image", "no_image", "huggingface");
  }

  const arr = await blob.arrayBuffer();
  return Buffer.from(arr);
}

export const huggingface: ImageProvider = {
  id: "huggingface",
  label: "HuggingFace (FLUX.1-schnell, free with token)",
  modelLabel: DEFAULT_MODEL,
  supportsReference: false,
  isAvailable: () => Boolean(process.env.HF_TOKEN),
  whyUnavailable: () =>
    process.env.HF_TOKEN
      ? null
      : "Set HF_TOKEN in Vercel project env. Create a fine-grained token with 'Make calls to Inference Providers' permission at https://huggingface.co/settings/tokens.",

  async generateFromText(prompt, opts) {
    return callHuggingFace(prompt, opts);
  },
};
