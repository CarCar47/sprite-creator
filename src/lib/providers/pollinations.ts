import { ProviderError, type ImageGenOpts, type ImageProvider } from "./types";

const ENDPOINT = "https://image.pollinations.ai/prompt";

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

export function buildPollinationsUrl(prompt: string, opts: ImageGenOpts = {}): string {
  const { width, height } = aspectToWH(opts.aspectRatio, opts.imageSize);
  const params = new URLSearchParams({
    model: "flux",
    width: String(width),
    height: String(height),
    nologo: "true",
    private: "true",
    safe: "true",
  });
  if (typeof opts.seed === "number") {
    params.set("seed", String(opts.seed));
  }
  return `${ENDPOINT}/${encodeURIComponent(prompt)}?${params.toString()}`;
}

export const pollinations: ImageProvider = {
  id: "pollinations",
  label: "Pollinations (no signup, truly free)",
  modelLabel: "FLUX / auto-routed",
  supportsReference: false,
  isAvailable: () => true,
  whyUnavailable: () => null,

  async generateFromText(prompt, opts) {
    const url = buildPollinationsUrl(prompt, opts);

    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        signal: opts.signal,
        headers: { Accept: "image/*" },
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new ProviderError("Pollinations request was aborted", "timeout", "pollinations");
      }
      throw new ProviderError(
        `Pollinations network error: ${err instanceof Error ? err.message : String(err)}`,
        "upstream",
        "pollinations",
      );
    }

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("retry-after") ?? "60", 10);
      throw new ProviderError(
        "Pollinations is rate-limiting this client. Try again shortly or switch providers.",
        "rate_limit",
        "pollinations",
        retryAfter,
      );
    }

    if (!res.ok) {
      throw new ProviderError(
        `Pollinations returned HTTP ${res.status}`,
        "upstream",
        "pollinations",
      );
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      throw new ProviderError(
        `Pollinations returned non-image content-type: ${contentType}`,
        "no_image",
        "pollinations",
      );
    }

    const arr = await res.arrayBuffer();
    if (arr.byteLength === 0) {
      throw new ProviderError("Pollinations returned an empty body", "no_image", "pollinations");
    }
    return Buffer.from(arr);
  },
};
