"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireWorkspace, requireWorkspaceId } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { sweepStaleRuns } from "@/lib/ai/stale-runs";
import {
  runLookalikeEngine,
  parseEmployeeRange,
  MONTHLY_LOOKALIKE_LIMIT,
  MIN_SEED_DOMAINS,
  MAX_SEED_DOMAINS,
} from "@/lib/ai/lookalike";
import { startDiscovery } from "../discovery/actions";
import { SIZE_BUCKETS } from "../discovery/constants";

/**
 * Reduce whatever was pasted to a bare hostname.
 *
 * A deliberate local copy of the same function in `audits/actions.ts`. There is a
 * third, looser variant inline in `discovery/actions.ts` that falls back to the
 * raw string instead of rejecting it, so the three have already drifted; folding
 * them into one shared helper is the right fix, but it would change the behaviour
 * of two working, deployed paths to tidy up a fifteen-line function. Worth doing
 * deliberately, not as a side effect of adding a feature.
 */
function normalizeDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const host = url.hostname.replace(/^www\./, "");
    if (!host.includes(".") || host.startsWith(".") || host.endsWith(".")) return null;
    return host;
  } catch {
    return null;
  }
}

/**
 * Start one lookalike run and return the run to poll.
 *
 * Returns a run id rather than a profile because reading up to five websites and
 * writing a profile takes a minute or two — far past a serverless request budget.
 * Same background-job-plus-poll shape as `startGrowthAudit` and `startDiscovery`.
 */
export async function startLookalike(payload: { domains: string }) {
  const { workspaceId, userId } = await requireWorkspace();

  // ── What they pasted ──────────────────────────────────────────────────────
  // Split on newlines and commas, because agencies paste both a list and a
  // comma-separated line, and deduped because pasting the same customer twice
  // would otherwise count as two seeds and fake agreement with itself.
  const seen = new Set<string>();
  const domains: string[] = [];
  const rejected: string[] = [];

  for (const raw of payload.domains.split(/[\n,]/)) {
    const piece = raw.trim();
    if (!piece) continue;

    const domain = normalizeDomain(piece);
    if (!domain) {
      rejected.push(piece.slice(0, 60));
      continue;
    }
    if (seen.has(domain)) continue;
    seen.add(domain);
    domains.push(domain);
  }

  if (rejected.length > 0) {
    throw new Error(
      `These do not look like website addresses: ${rejected.join(", ")}. Use one address per line, like acme.com.`
    );
  }

  if (domains.length < MIN_SEED_DOMAINS) {
    throw new Error(
      `Add at least ${MIN_SEED_DOMAINS} customer websites. One company on its own has no pattern to find.`
    );
  }

  if (domains.length > MAX_SEED_DOMAINS) {
    throw new Error(
      `Use at most ${MAX_SEED_DOMAINS} customers. More than that widens the profile until it stops describing anything in particular — pick the ${MAX_SEED_DOMAINS} you would most like more of.`
    );
  }

  // ── Monthly quota ─────────────────────────────────────────────────────────
  // Counts runs regardless of outcome, like the audit limit: counting only
  // successes would let a workspace burn unlimited fetches on sites that fail.
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const usedThisMonth = await prisma.agentRun.count({
    where: { workspaceId, type: "LOOKALIKE", createdAt: { gte: startOfMonth } },
  });

  if (usedThisMonth >= MONTHLY_LOOKALIKE_LIMIT) {
    throw new Error(
      `You have used all ${MONTHLY_LOOKALIKE_LIMIT} lookalike searches for this month. The limit resets on the 1st.`
    );
  }

  // ── Double-click guard ────────────────────────────────────────────────────
  // Scoped to the workspace rather than to this exact domain list, unlike the
  // audit's guard: two lookalike runs at once would read up to ten sites in
  // parallel and produce two profiles the screen can only show one of. One at a
  // time is also simply what the agency means.
  //
  // Runs with no recent write are ignored — `sweepStaleRuns` is about to fail
  // them, and treating a dead run as in-flight would lock the agency out.
  const inFlight = await prisma.agentRun.findFirst({
    where: {
      workspaceId,
      type: "LOOKALIKE",
      status: { in: ["QUEUED", "RUNNING"] },
      updatedAt: { gt: new Date(Date.now() - 15 * 60 * 1000) },
    },
    select: { id: true },
  });

  if (inFlight) {
    // Not an error: hand back the run already doing the work, so a second click
    // just starts watching the first one.
    return { success: true as const, runId: inFlight.id, alreadyRunning: true as const };
  }

  const agentRun = await prisma.agentRun.create({
    data: {
      workspaceId,
      userId,
      type: "LOOKALIKE",
      status: "QUEUED",
      title: "Lookalike Profile",
      description: `Reading ${domains.length} customer ${domains.length === 1 ? "website" : "websites"}`,
      inputParams: { domains },
    },
    select: { id: true },
  });

  // Unawaited on purpose — the action has to return before the UI can poll.
  // `runLookalikeEngine` owns all of its errors and always reaches a terminal
  // status, so nothing here can leave a poll spinning.
  runLookalikeEngine({ workspaceId, agentRunId: agentRun.id, domains }).catch(console.error);

  return { success: true as const, runId: agentRun.id, alreadyRunning: false as const };
}

/**
 * Poll one run started from this screen.
 *
 * Used for both phases: the lookalike run that builds the profile, and the
 * discovery run that "Find companies like these" kicks off. Both are `AgentRun`
 * rows and both only need a terminal status and a reason, so one action serves
 * both rather than two near-identical ones.
 *
 * `sweepStaleRuns` runs here rather than on a schedule, matching `checkRunStatus`
 * and `checkAuditRunStatus`: the poll is the only thing guaranteed to be happening
 * while a run is in flight, so it is the reliable place to notice one that a
 * serverless timeout killed.
 */
export async function checkLookalikeRunStatus(runId: string) {
  const workspaceId = await requireWorkspaceId();

  await sweepStaleRuns(workspaceId);

  // Scoped to the workspace, not `findUnique` by id: `errorMessage` quotes the
  // domains the agency pasted, which are its own customer list.
  const run = await prisma.agentRun.findFirst({
    where: { id: runId, workspaceId },
    select: { status: true, errorMessage: true },
  });

  if (!run) throw new Error("That run was not found in your workspace.");

  return { status: run.status, errorMessage: run.errorMessage };
}

// ─────────────────────────────────────────────────────────────
// THE EDITED PROFILE
// ─────────────────────────────────────────────────────────────

/**
 * Everything below arrives from the browser after the agency has edited it, so
 * none of it is trusted. Empty strings are dropped and every list is capped,
 * because these values end up in a live web search query and in `String[]`
 * columns.
 */
const StringList = z.preprocess(
  (value) =>
    Array.isArray(value) ? value.filter((v) => typeof v === "string" && v.trim() !== "") : [],
  z.array(z.string().trim().min(1).max(120)).max(20)
);

const EditedProfileSchema = z.object({
  name: z.string().trim().min(1).max(120),
  industries: StringList,
  geographies: StringList,
  keywords: StringList,
  technologies: StringList,
  businessModels: StringList,
  /**
   * One of the six discovery buckets, or null for "any size". Validated against
   * the list rather than accepted as free text, because this string is
   * interpolated straight into the search query.
   */
  size: z
    .string()
    .trim()
    .nullable()
    .refine((v) => v === null || SIZE_BUCKETS.includes(v), {
      message: "That is not one of the available size ranges.",
    }),
});

export type EditedProfile = z.infer<typeof EditedProfileSchema>;

/**
 * Save the profile over the workspace's ICP.
 *
 * A **partial** update on purpose. The ICP row also holds `buyerRoles`,
 * `excludeKeywords`, `excludedIndustries` and revenue bounds, none of which a
 * lookalike profile can infer — overwriting those with empty arrays would quietly
 * discard work the agency did by hand in Settings, and it would do it behind a
 * button labelled "save", which is the worst place to lose something.
 *
 * Writes to the same `demo-icp-${workspaceId}` id `updateWorkspaceSettings` uses.
 * That id pattern is inherited from the demo seed and is misleadingly named, but
 * it is load-bearing: `runDiscoveryEngine` and the Settings page both read the
 * workspace's ICP with an unordered `findFirst`, so creating a second ICP row
 * here would make which one they read a coin flip.
 */
export async function saveProfileAsIcp(input: unknown) {
  const workspaceId = await requireWorkspaceId();
  const profile = EditedProfileSchema.parse(input);

  // Derived from the chosen bucket rather than taken from the browser, so the
  // saved bounds and the size that gets searched on can never disagree.
  const bounds = profile.size ? parseEmployeeRange(profile.size) : null;

  const shared = {
    name: profile.name,
    industries: profile.industries,
    geographies: profile.geographies,
    technologies: profile.technologies,
    businessModel: profile.businessModels,
    // The discovery engine reads `buyingSignals` as its keyword list when no
    // `icpParams` are passed, which is exactly what these keywords are for.
    buyingSignals: profile.keywords,
    companySizeMin: bounds?.min ?? null,
    companySizeMax: bounds?.max ?? null,
  };

  await prisma.iCP.upsert({
    where: { id: `demo-icp-${workspaceId}` },
    update: shared,
    create: { id: `demo-icp-${workspaceId}`, workspaceId, ...shared },
  });

  // Both screens read the ICP on the server, so both are stale now.
  revalidatePath("/settings");
  revalidatePath("/discovery");

  return { success: true as const };
}

/**
 * Hand the profile to the discovery engine.
 *
 * The payoff of the whole feature, and deliberately a thin wrapper: it converts
 * the profile into the `icpParams` shape and calls `startDiscovery`, which already
 * owns the monthly budget check, the run row and the engine hand-off. Reproducing
 * any of that here would mean a lookalike search could quietly bypass the budget
 * an agency set.
 *
 * Note this does *not* save the ICP. Searching and saving are separate buttons
 * because they are separate decisions — an agency will often want to try a search
 * before committing the profile as its official ICP.
 */
export async function searchForLookalikes(input: unknown) {
  const profile = EditedProfileSchema.parse(input);

  if (profile.industries.length === 0) {
    throw new Error("Add at least one industry — a search with no industry has nothing to look for.");
  }

  if (profile.geographies.length === 0) {
    throw new Error("Add at least one country. Without one the search covers the entire world and returns noise.");
  }

  // `["ALL"]` per country is the whole-country marker the discovery form uses;
  // a lookalike profile never narrows to specific cities or states.
  const countries: Record<string, string[]> = {};
  for (const country of profile.geographies) countries[country] = ["ALL"];

  return startDiscovery({
    // Labels every company this search adds for the first time, so a prospect
    // that only exists because of a lookalike search stays distinguishable from
    // one the agency went looking for by hand. Companies it re-finds keep their
    // original label — `Company.discoverySource` records how you *first* met
    // them, which is why the Companies page filters by run instead of by this.
    source: "lookalike",
    icpParams: {
      countries,
      industries: profile.industries,
      size: profile.size,
      keywords: profile.keywords,
      // Nothing to exclude: the enterprise filter in `runDiscoveryEngine` already
      // removes household names, and a lookalike profile has no opinion beyond
      // that. Whatever the agency set in Settings stays there — this run passes
      // `icpParams`, which takes precedence, so it is not silently applied here.
      excludeKeywords: [],
    },
  });
}
