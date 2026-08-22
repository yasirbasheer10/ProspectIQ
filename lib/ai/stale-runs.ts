import { prisma } from "@/lib/db";

/**
 * How long a run may go without any database write before it's considered dead.
 *
 * Every engine touches its AgentRun as it progresses — discovery increments
 * `processedItems` per domain, the orchestrator rewrites `outputData` per step —
 * so `updatedAt` is a liveness heartbeat. Fifteen minutes is comfortably longer
 * than the gap between two heartbeats on the slowest path (a batch of three
 * domains, each a 20s Jina fetch plus an AI call with up to three retries) and
 * far longer than any serverless function is allowed to live, which is the
 * reason these runs die in the first place.
 */
export const STALE_RUN_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Marks abandoned runs FAILED.
 *
 * Discovery, research and outreach are all kicked off fire-and-forget
 * (`runDiscoveryEngine(...).catch(console.error)`) on a serverless platform, so
 * when the function that started a run is torn down mid-execution nothing is
 * left alive to write a terminal status. The row stays QUEUED or RUNNING
 * forever, the UI spinner never stops, and there is no way to distinguish "still
 * working" from "died twelve hours ago".
 *
 * Called from the places that read run status, so the correction happens
 * wherever someone is actually looking. PAUSED runs are deliberately excluded —
 * a user paused those on purpose and they are allowed to sit indefinitely.
 *
 * @param workspaceId Limit the sweep to one workspace. Omit to sweep all.
 * @returns The number of runs marked FAILED.
 */
export async function sweepStaleRuns(workspaceId?: string): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_RUN_TIMEOUT_MS);

  const { count } = await prisma.agentRun.updateMany({
    where: {
      ...(workspaceId ? { workspaceId } : {}),
      status: { in: ["QUEUED", "RUNNING"] },
      updatedAt: { lt: cutoff },
    },
    data: {
      status: "FAILED",
      completedAt: new Date(),
      errorMessage:
        `This run stopped reporting progress for more than ${Math.round(STALE_RUN_TIMEOUT_MS / 60000)} minutes ` +
        `and has been marked failed. The most likely cause is the serverless function being torn down ` +
        `mid-run — check the Vercel function logs for this time window. Any companies it had already ` +
        `saved are kept.`,
    },
  });

  if (count > 0) {
    console.warn(`Marked ${count} stale agent run(s) as FAILED (no progress since ${cutoff.toISOString()}).`);
  }

  return count;
}
