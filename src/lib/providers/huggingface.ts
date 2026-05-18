import { ProviderError, type ImageGenOpts, type ImageProvider } from "./types";

const ENDPOINT_BASE = "https://api-inference.huggingface.co/models";
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

async function callHuggingFace(
  prompt: string,
  opts: ImageGenOpts,
  token: string,
  attempt = 0,
): Promise<Buffer> {
  const model = process.env.HUGGINGFACE_MODEL ?? DEFAULT_MODEL;
  const { width, height } = aspectToWH(opts.aspectRatio, opts.imageSize);

  let res: Response;
  try {
    res = await fetch(`${ENDPOINT_BASE}/${model}`, {
      method: "POST",
      signal: opts.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "image/png",
        "x-wait-for-model": "true",
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          width,
          height,
          num_inference_steps: 4,
          ...(typeof opts.seed === "number" ? { seed: opts.seed } : {}),
        },
      }),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ProviderError("HuggingFace request was aborted", "timeout", "huggingface");
    }
    throw new ProviderError(
      `HuggingFace network error: ${err instanceof Error ? err.message : String(err)}`,
      "upstream",
      "huggingface",
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new ProviderError(
      "HuggingFace rejected the token. Verify HF_TOKEN at https://huggingface.co/settings/tokens.",
      "auth",
      "huggingface",
    );
  }

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("retry-after") ?? "60", 10);
    throw new ProviderError(
      "HuggingFace rate limit hit. Wait, switch providers, or upgrade your HF account.",
      "rate_limit",
      "huggingface",
      retryAfter,
    );
  }

  // Cold-load: HF returns 503 with JSON { error, estimated_time } on first hit to an idle model.
  if (res.status === 503 && attempt < 1) {
    let estimatedMs = 5000;
    try {
      const body = (await res.clone().json()) as { estimated_time?: number };
      if (typeof body.estimated_time === "number") {
        estimatedMs = Math.min(20000, Math.max(2000, Math.round(body.estimated_time * 1000)));
      }
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, estimatedMs));
    return callHuggingFace(prompt, opts, token, attempt + 1);
  }

  if (!res.ok) {
    let detail = "";
    try {
      const txt = await res.text();
      detail = txt.slice(0, 300);
    } catch {
      /* ignore */
    }
    throw new ProviderError(
      `HuggingFace HTTP ${res.status}${detail ? `: ${detail}` : ""}`,
      "upstream",
      "huggingface",
    );
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    const text = await res.text().catch(() => "");
    throw new ProviderError(
      `HuggingFace returned non-image content-type: ${contentType}${text ? ` — ${text.slice(0, 200)}` : ""}`,
      "no_image",
      "huggingface",
    );
  }

  const arr = await res.arrayBuffer();
  if (arr.byteLength === 0) {
    throw new ProviderError("HuggingFace returned an empty body", "no_image", "huggingface");
  }
  return Buffer.from(arr);
}

export const huggingface: ImageProvider = {
  id: "huggingface",
  label: "HuggingFace (FLUX.1-schnell, free with token)",
  modelLabel: "FLUX.1-schnell",
  supportsReference: false,
  isAvailable: () => Boolean(process.env.HF_TOKEN),
  whyUnavailable: () =>
    process.env.HF_TOKEN
      ? null
      : "Set HF_TOKEN in Vercel project env. Get a free token at https://huggingface.co/settings/tokens.",

  async generateFromText(prompt, opts) {
    const token = process.env.HF_TOKEN;
    if (!token) {
      throw new ProviderError("HF_TOKEN is not configured", "unavailable", "huggingface");
    }
    return callHuggingFace(prompt, opts, token);
  },
};
