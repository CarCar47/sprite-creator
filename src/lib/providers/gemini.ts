import { GoogleGenAI, type GenerateContentResponse } from "@google/genai";
import {
  ProviderError,
  type ImageGenOpts,
  type ImageProvider,
  type ReferenceImage,
} from "./types";

const DEFAULT_MODEL = "gemini-2.5-flash-image";

let _client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!_client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new ProviderError("GEMINI_API_KEY is not configured", "unavailable", "gemini");
    }
    _client = new GoogleGenAI({ apiKey });
  }
  return _client;
}

function getModelId(): string {
  return process.env.GEMINI_IMAGE_MODEL ?? DEFAULT_MODEL;
}

type ContentPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

async function callModel(contents: ContentPart[], opts: ImageGenOpts): Promise<Buffer> {
  const client = getClient();

  let response: GenerateContentResponse;
  try {
    response = await client.models.generateContent({
      model: getModelId(),
      contents,
      config: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: {
          aspectRatio: opts.aspectRatio ?? "1:1",
          imageSize: opts.imageSize ?? "1K",
        },
        ...(opts.signal ? { abortSignal: opts.signal } : {}),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("429") || message.toLowerCase().includes("quota")) {
      throw new ProviderError(
        "Gemini quota exhausted. Free tier on new accounts is 0 — enable billing in Google Cloud.",
        "rate_limit",
        "gemini",
      );
    }
    if (
      err instanceof DOMException &&
      err.name === "AbortError"
    ) {
      throw new ProviderError("Gemini request was aborted", "timeout", "gemini");
    }
    throw new ProviderError(`Gemini upstream error: ${message}`, "upstream", "gemini");
  }

  return extractImageBuffer(response);
}

export function extractImageBuffer(response: GenerateContentResponse): Buffer {
  const feedback = response.promptFeedback;
  if (feedback?.blockReason) {
    throw new ProviderError(
      `Prompt blocked by Gemini safety filter: ${feedback.blockReason}`,
      "safety",
      "gemini",
    );
  }

  const candidate = response.candidates?.[0];
  if (!candidate) {
    throw new ProviderError("Gemini returned no candidates", "no_image", "gemini");
  }

  if (candidate.finishReason && String(candidate.finishReason) !== "STOP") {
    const blocked = candidate.safetyRatings?.find((r) => r.blocked);
    if (blocked) {
      throw new ProviderError(
        `Output blocked by Gemini safety: ${blocked.category ?? "unknown"}`,
        "safety",
        "gemini",
      );
    }
    if (String(candidate.finishReason) === "SAFETY") {
      throw new ProviderError("Output blocked by Gemini safety", "safety", "gemini");
    }
  }

  const parts = candidate.content?.parts ?? [];
  for (const part of parts) {
    const data = part.inlineData?.data;
    if (data) {
      return Buffer.from(data, "base64");
    }
  }

  throw new ProviderError("Gemini response contained no image data", "no_image", "gemini");
}

export const gemini: ImageProvider = {
  id: "gemini",
  label: "Gemini 2.5 Flash Image (paid)",
  modelLabel: DEFAULT_MODEL,
  supportsReference: true,
  isAvailable: () => Boolean(process.env.GEMINI_API_KEY),
  whyUnavailable: () =>
    process.env.GEMINI_API_KEY
      ? null
      : "Set GEMINI_API_KEY in Vercel project env. Billing must be enabled on the Google Cloud project as of May 2026 (free tier no longer covers image gen).",

  async generateFromText(prompt, opts) {
    return callModel([{ text: prompt }], opts);
  },

  async generateFromTextAndReference(
    prompt: string,
    ref: ReferenceImage,
    opts: ImageGenOpts,
  ): Promise<Buffer> {
    return callModel(
      [{ text: prompt }, { inlineData: { mimeType: ref.mimeType, data: ref.base64 } }],
      opts,
    );
  },
};
