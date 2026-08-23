import { NextResponse, type NextRequest } from "next/server";
import { assertSameOriginJson, requireConfirmation, RequestRejectedError } from "@/lib/api-guards";

/**
 * POST /api/demo/reset
 *
 * Deletes every company, ICP, offer, sequence and agent run in the caller's
 * workspace. Requires a same-origin JSON request carrying
 * `{"confirm":"RESET MY WORKSPACE"}` — see lib/api-guards.ts for why.
 */
const CONFIRMATION = "RESET MY WORKSPACE";

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production" && process.env.DEMO_MODE !== "true") {
    return NextResponse.json({ error: "Demo resetting is only available in demo mode." }, { status: 403 });
  }

  try {
    assertSameOriginJson(req);
    await requireConfirmation(req, CONFIRMATION);

    const { requireWorkspaceId } = await import("@/lib/session");
    const { resetDemoData } = await import("@/lib/demo/seed");

    const workspaceId = await requireWorkspaceId();
    await resetDemoData(workspaceId);

    return NextResponse.json({
      success: true,
      message: "Demo data reset successfully",
    });
  } catch (error: unknown) {
    if (error instanceof RequestRejectedError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    // No `detail`. This used to return the caught message verbatim, which on a
    // route that talks to Prisma hands the caller table names, column names and
    // connection details when anything goes wrong.
    console.error("Demo reset error:", error);
    return NextResponse.json({ error: "Failed to reset demo data." }, { status: 500 });
  }
}
