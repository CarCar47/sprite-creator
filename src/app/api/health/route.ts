import { NextResponse } from "next/server";
import packageJson from "../../../../package.json";
import { summarizeProviders } from "@/lib/providers/registry";

export const dynamic = "force-dynamic";

export async function GET() {
  const providers = summarizeProviders();
  return NextResponse.json(
    {
      status: "ok",
      version: packageJson.version,
      hasUpstash: Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN),
      providers,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
