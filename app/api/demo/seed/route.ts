import { NextResponse, type NextRequest } from "next/server";
import { assertSameOriginJson, RequestRejectedError } from "@/lib/api-guards";

/**
 * POST /api/demo/seed
 * Seeds the caller's workspace with demo data. Safe to call multiple times
 * (idempotent), so it needs no confirmation token — but it does write fixture
 * companies and contacts into a real workspace, so it is still same-origin only.
 */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production" && process.env.DEMO_MODE !== "true") {
    return NextResponse.json({ error: "Demo seeding is only available in demo mode." }, { status: 403 });
  }

  try {
    assertSameOriginJson(req);

    // Dynamic import to avoid Prisma edge runtime issues
    const { requireWorkspaceId } = await import("@/lib/session");
    const { seedDemoData } = await import("@/lib/demo/seed");

    const workspaceId = await requireWorkspaceId();
    const result = await seedDemoData(workspaceId);

    return NextResponse.json({
      success: true,
      message: "Demo data seeded successfully",
      data: result,
    });
  } catch (error: unknown) {
    if (error instanceof RequestRejectedError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    // No `detail` — see the note in ../reset/route.ts.
    console.error("Demo seed error:", error);
    return NextResponse.json({ error: "Failed to seed demo data." }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ message: "Use POST to seed demo data." });
}
