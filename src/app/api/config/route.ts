import { NextResponse } from "next/server";
import { geminiConfigured } from "@/lib/server/gemini";
export function GET() {
  return NextResponse.json(
    { ai: geminiConfigured() ? "live" : "demo", provider: "gemini" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
