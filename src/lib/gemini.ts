import { GoogleGenAI, type GenerateContentResponse } from "@google/genai";

const DEFAULT_MODEL = "gemini-3.1-flash-image-preview";

export class GeminiSafetyError extends Error {
  constructor(
    message: string,
    public readonly category: string,
  ) {
    super(message);
    this.name = "GeminiSafetyError";
  }
}

export class GeminiNoImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiNoImageError";
  }
}

export class GeminiUpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiUpstreamError";
  }
}

let _client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!_client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new GeminiUpstreamError("GEMINI_API_KEY is not configured");
    }
    _client = new GoogleGenAI({ apiKey });
  }
  return _client;
}

function getModelId(): string {
  return process.env.GEMINI_IMAGE_MODEL ?? DEFAULT_MODEL;
}

export interface ImageGenOpts {
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  imageSize?: "1K" | "2K";
  signal?: AbortSignal;
}

type ContentPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

async function callModel(contents: ContentPart[], opts: ImageGenOpts): Promise<Buffer> {
  const client = getClient();

  const response = await client.models.generateContent({
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

  return extractImageBuffer(response);
}

export function extractImageBuffer(response: GenerateContentResponse): Buffer {
  const feedback = response.promptFeedback;
  if (feedback?.blockReason) {
    throw new GeminiSafetyError(
      `Prompt blocked by safety filter: ${feedback.blockReason}`,
      String(feedback.blockReason),
    );
  }

  const candidate = response.candidates?.[0];
  if (!candidate) {
    throw new GeminiNoImageError("Model returned no candidates");
  }

  if (candidate.finishReason && candidate.finishReason !== "STOP") {
    const blocked = candidate.safetyRatings?.find((r) => r.blocked);
    if (blocked) {
      throw new GeminiSafetyError(
        `Output blocked by safety filter: ${blocked.category ?? "unknown"}`,
        String(blocked.category ?? "unknown"),
      );
    }
    if (String(candidate.finishReason) === "SAFETY") {
      throw new GeminiSafetyError("Output blocked by safety filter", "SAFETY");
    }
  }

  const parts = candidate.content?.parts ?? [];
  for (const part of parts) {
    const data = part.inlineData?.data;
    if (data) {
      return Buffer.from(data, "base64");
    }
  }

  throw new GeminiNoImageError("Model response contained no image data");
}

export async function generateImageFromText(
  prompt: string,
  opts: ImageGenOpts = {},
): Promise<Buffer> {
  return callModel([{ text: prompt }], opts);
}

export async function generateImageFromTextAndReference(
  prompt: string,
  refImage: { mimeType: string; base64: string },
  opts: ImageGenOpts = {},
): Promise<Buffer> {
  return callModel(
    [
      { text: prompt },
      { inlineData: { mimeType: refImage.mimeType, data: refImage.base64 } },
    ],
    opts,
  );
}
