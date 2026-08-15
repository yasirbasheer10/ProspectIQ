import { NextResponse } from "next/server";

/**
 * POST /api/demo/seed
 * Seeds the database with demo data for the demo workspace.
 * Safe to call multiple times (idempotent).
 */
export async function POST() {
  if (process.env.NODE_ENV === "production" && process.env.DEMO_MODE !== "true") {
    return NextResponse.json({ error: "Demo seeding is only available in demo mode." }, { status: 403 });
  }

  try {
    // Dynamic import to avoid Prisma edge runtime issues
    const { getDemoSession } = await import("@/lib/session");
    const { seedDemoData } = await import("@/lib/demo/seed");

    const session = await getDemoSession();
    const result = await seedDemoData(session.workspaceId);

    return NextResponse.json({
      success: true,
      message: "Demo data seeded successfully",
      data: result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Demo seed error:", error);
    return NextResponse.json(
      { error: "Failed to seed demo data", detail: message },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ message: "Use POST to seed demo data." });
}
