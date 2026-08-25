import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireWorkspaceId } from "@/lib/session";
import {
  MONTHLY_LOOKALIKE_LIMIT,
  parseStoredLookalikeProfile,
} from "@/lib/ai/lookalike";
import { sizeBucketFor } from "./icp-params";
import { LookalikeClient, type LookalikeProfileView } from "./LookalikeClient";

export const metadata: Metadata = { title: "Lookalike Search" };

/**
 * The lookalike screen.
 *
 * Shows the most recent finished profile rather than a list of them, which is a
 * deliberate difference from the audits page. An audit is a deliverable — the
 * agency sends each one to a different prospect and needs all of them. A
 * lookalike profile is a working hypothesis about a market: the agency edits it,
 * searches on it, and then either saves it as the workspace ICP or throws it away.
 * A history of superseded hypotheses is clutter, and every run is still on the
 * runs list if anyone wants it.
 */
export default async function LookalikePage() {
  const workspaceId = await requireWorkspaceId();

  // Same month boundary `startLookalike` uses. Recomputed here rather than shared,
  // because the action must not trust a number from the browser and this one is
  // only ever for display.
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [run, usedThisMonth] = await Promise.all([
    prisma.agentRun.findFirst({
      where: { workspaceId, type: "LOOKALIKE", status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, outputData: true },
    }),
    prisma.agentRun.count({
      where: { workspaceId, type: "LOOKALIKE", createdAt: { gte: startOfMonth } },
    }),
  ]);

  // A COMPLETED run whose `outputData` does not parse is treated as no profile at
  // all. That happens if the stored shape ever changes under a row written by an
  // older deploy — and showing the paste box is the right answer, because a
  // profile costs one run to rebuild and nothing has been sent to anybody.
  const profile = run ? parseStoredLookalikeProfile(run.outputData) : null;

  const latest: LookalikeProfileView | null =
    run && profile
      ? {
          runId: run.id,
          createdAt: run.createdAt,
          profile,
          // Computed here, on the server, because `sizeBucketFor` reaches into
          // `lib/ai/lookalike.ts`, which imports Prisma and the Groq client.
          initialSize: sizeBucketFor(profile.companySizeMin, profile.companySizeMax),
        }
      : null;

  return (
    <LookalikeClient
      latest={latest}
      usedThisMonth={usedThisMonth}
      monthlyLimit={MONTHLY_LOOKALIKE_LIMIT}
    />
  );
}
