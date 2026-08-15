import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "0.1.0",
    mode: process.env.DEMO_MODE === "true" ? "demo" : "production",
  });
}
