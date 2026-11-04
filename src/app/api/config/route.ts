import { NextResponse } from "next/server";
export function GET() {
  return NextResponse.json({ ai: process.env.LLM_API_KEY ? "live" : "demo" });
}
