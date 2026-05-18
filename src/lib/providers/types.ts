export const PROVIDER_IDS = ["pollinations", "huggingface", "gemini"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface ImageGenOpts {
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  imageSize?: "1K" | "2K";
  seed?: number;
  signal?: AbortSignal;
}

export interface ReferenceImage {
  mimeType: string;
  base64: string;
}

export interface ImageProvider {
  readonly id: ProviderId;
  readonly label: string;
  /** Human-visible model identifier (e.g. "FLUX.1-schnell"). */
  readonly modelLabel: string;
  /** Whether this provider can take a reference image for character consistency. */
  readonly supportsReference: boolean;
  /** Whether the provider's credentials/env vars are configured in the current environment. */
  isAvailable(): boolean;
  /** Why this provider is unavailable, if it is. Used to render help text in the UI. */
  whyUnavailable(): string | null;
  generateFromText(prompt: string, opts: ImageGenOpts): Promise<Buffer>;
  generateFromTextAndReference?(
    prompt: string,
    ref: ReferenceImage,
    opts: ImageGenOpts,
  ): Promise<Buffer>;
}

export type ProviderErrorCode =
  | "safety"
  | "no_image"
  | "rate_limit"
  | "auth"
  | "timeout"
  | "upstream"
  | "unavailable";

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly code: ProviderErrorCode,
    public readonly providerId: ProviderId,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
