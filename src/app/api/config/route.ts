import { NextResponse } from "next/server";
import { geminiConfigured } from "@/lib/server/gemini";
import type { AppConfiguration } from "@/lib/types";
export function GET() {
  const configuration: AppConfiguration = {
    ai: geminiConfigured() ? "live" : "demo",
    provider: "gemini",
    demoAllowed: process.env.ALLOW_DEMO !== "false",
    readiness: {
      gemini: geminiConfigured(),
      authentication: Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      ),
      storage: Boolean(process.env.SUPABASE_SECRET_KEY?.trim()),
    },
  };
  return NextResponse.json(configuration, {
    headers: { "Cache-Control": "no-store" },
  });
}
