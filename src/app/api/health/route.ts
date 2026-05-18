import { NextResponse } from "next/server";
import packageJson from "../../../../package.json";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      version: packageJson.version,
      model: process.env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-image-preview",
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
      hasUpstash: Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
