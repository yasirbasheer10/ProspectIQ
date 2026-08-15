import { NextResponse } from "next/server";

/**
 * POST /api/demo/reset
 * Wipes all data for the demo workspace.
 */
export async function POST() {
  if (process.env.NODE_ENV === "production" && process.env.DEMO_MODE !== "true") {
    return NextResponse.json({ error: "Demo resetting is only available in demo mode." }, { status: 403 });
  }

  try {
    const { getDemoSession } = await import("@/lib/session");
    const { resetDemoData } = await import("@/lib/demo/seed");

    const session = await getDemoSession();
    await resetDemoData(session.workspaceId);

    return NextResponse.json({
      success: true,
      message: "Demo data reset successfully",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Demo reset error:", error);
    return NextResponse.json(
      { error: "Failed to reset demo data", detail: message },
      { status: 500 }
    );
  }
}
