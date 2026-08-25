/**
 * Lookalike Search.
 *
 * An agency pastes the websites of two to five customers it already has and
 * already likes, and gets back a description of what those companies have in
 * common — which it can then save as its ICP and hand to the discovery engine to
 * go and find more of them.
 *
 * ── Why this is not "Discovery with a different form" ─────────────────────────
 *
 * Discovery asks the agency to describe a market from memory: pick industries,
 * pick a size band, type some keywords. That is a guess, and it is the hardest
 * part of the product to get right — an agency that has been selling for six
 * years still cannot reliably articulate the pattern in its own client list. This
 * feature inverts the question. Instead of "describe your ideal customer", it
 * asks "who are your best customers", which is a question every agency can
 * answer instantly and correctly, and derives the description from the answer.
 *
 * So this is a *front end for the ICP*, not a second search engine. It ends by
 * calling `startDiscovery` with the profile it computed. Nothing about crawling,
 * searching or scoring is duplicated here.
 *
 * ── The one rule that makes the output trustworthy ────────────────────────────
 *
 * Every firmographic fact in the profile is computed in code, by
 * `computeSharedProfile`, from the real `Company` rows the pasted domains
 * produced. The language model is given those facts and asked only for the
 * narrative: a name for the pattern, a paragraph describing it, and the search
 * phrases that would find more of them.
 *
 * That split is the whole feature. Ask a model to "build an ICP from these three
 * companies" and it returns a fluent, plausible, entirely generic B2B profile —
 * and critically, nothing downstream can tell that apart from a real one. The
 * agency would then run discovery against a profile that had nothing to do with
 * its own customers and blame the results. Restricting the model to the parts
 * arithmetic cannot do makes that failure impossible rather than unlikely.
 *
 * ── What the data can and cannot tell us today ────────────────────────────────
 *
 * Worth knowing before reading `computeSharedProfile` and wondering why it hedges
 * so much. `ingestDomain` writes `industry`, `description`, `headquarters` and
 * `employeeRange` — and `employeeRange` is whatever the model could infer from a
 * homepage, very often the literal string "Unknown". It does not write
 * `technologies` or `employeeCount` at all; only the demo seed and a full
 * `researchCompany` pass ever populate those. So for freshly pasted domains the
 * honest profile is usually industry + geography + keywords, with size and stack
 * blank.
 *
 * Two consequences, both deliberate: `confidence` reports exactly which of the
 * three agreed so the agency knows how much to trust the profile, and the profile
 * is shown in an editable form rather than saved automatically. A blank size band
 * the agency fills in itself is worth more than a confident one nobody measured.
 */

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { ai, MODEL } from "./groq";
import { LookalikeNarrativeSchema, parseAIResponse } from "./schemas";
import { ingestDomain } from "./discovery";

/**
 * Runs per workspace per calendar month.
 *
 * Lower than `MONTHLY_AUDIT_LIMIT` because a run costs up to five site fetches
 * and a model call, and because there is no legitimate reason to build twenty
 * different ICPs from your own client list in one month. It is a guard against a
 * loop, not a pricing tier.
 */
export const MONTHLY_LOOKALIKE_LIMIT = 20;

/** One company is not a pattern. Two is the minimum that can share anything. */
export const MIN_SEED_DOMAINS = 2;

/**
 * Past five the profile gets *worse*, not better: every extra seed widens the
 * industry list and the size band, and a profile that spans four industries
 * searches for nothing in particular. Five best customers is also about as many
 * as an agency can name without padding the list.
 */
export const MAX_SEED_DOMAINS = 5;

/** Matches the per-keyword slice in `searchForTargetsWithAI`, which is the consumer. */
const KEYWORD_MAX_LENGTH = 25;

/** `searchForTargetsWithAI` builds three web searches per keyword. Four is twelve. */
const MAX_KEYWORDS = 4;

/** Enough industries to describe a pattern, few enough that it stays one. */
const MAX_INDUSTRIES = 6;

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

/**
 * The subset of `Company` the profile is computed from.
 *
 * Declared here rather than imported from Prisma so `computeSharedProfile` can be
 * tested without a database or a generated client — the same reason
 * `lib/scoring/*` defines its own input shapes.
 */
export interface LookalikeSeedRow {
  name: string;
  domain: string | null;
  description: string | null;
  industry: string | null;
  businessModel: string | null;
  employeeCount: number | null;
  employeeRange: string | null;
  technologies: string[];
  headquarters: string | null;
  foundedYear: number | null;
}

export type LookalikeConfidence = "LOW" | "MEDIUM" | "HIGH";

/** What the seeds demonstrably have in common. No model output in here. */
export interface SharedProfile {
  industries: string[];
  technologies: string[];
  businessModels: string[];
  geographies: string[];
  /** Widened bounds, not the raw observed ones — see `computeSharedProfile`. */
  companySizeMin: number | null;
  /** Null means open-ended, e.g. every seed reported "1000+". */
  companySizeMax: number | null;
  seedCount: number;
  /** Which dimensions two or more seeds actually agreed on. */
  shared: { industry: boolean; size: boolean; technology: boolean };
  confidence: LookalikeConfidence;
  /** Written for the agency to read, not for a log. */
  confidenceReason: string;
}

/** One pasted domain and what became of it. */
export interface LookalikeSeedOutcome {
  domain: string;
  name: string | null;
  companyId: string | null;
  /** Only set when `companyId` is null: why this one could not be used. */
  skippedReason: string | null;
}

/** The whole profile as stored on `AgentRun.outputData`. */
export interface StoredLookalikeProfile extends SharedProfile {
  name: string;
  description: string;
  keywords: string[];
  sharedTraits: string[];
  seeds: LookalikeSeedOutcome[];
}

// ─────────────────────────────────────────────────────────────
// THE COMPUTED HALF
// ─────────────────────────────────────────────────────────────

/**
 * Turn the seed companies into the facts they share.
 *
 * Pure: no database, no model, no clock. That is deliberate — this function is
 * the part of the feature whose correctness actually matters, so it is the part
 * that has to be testable in isolation.
 *
 * The rule throughout is **count seeds, not occurrences**. A value that appears
 * in two of three companies is a pattern; the same value listed twice by one
 * company is not. Hence `tallyBySeed`.
 */
export function computeSharedProfile(rows: LookalikeSeedRow[]): SharedProfile {
  const seedCount = rows.length;

  // ── Industry ──────────────────────────────────────────────────────────────
  // Prefer industries at least two seeds share. When none are shared, fall back
  // to listing every industry present rather than returning nothing: an empty
  // industry list would make the resulting discovery search meaningless, and
  // "these three are in three different industries" is itself worth showing the
  // agency — `shared.industry` stays false and the confidence text says so.
  const industryTally = tallyBySeed(rows.map((r) => (r.industry ? [r.industry] : [])));
  const industriesSharedByTwo = industryTally.filter((t) => t.seeds >= 2);
  const industries = (industriesSharedByTwo.length > 0 ? industriesSharedByTwo : industryTally)
    .map((t) => t.label)
    .slice(0, MAX_INDUSTRIES);

  // ── Technology ────────────────────────────────────────────────────────────
  // No fallback here, unlike industry. A tool exactly one company uses says
  // nothing about the pattern, and an empty stack costs nothing downstream —
  // the discovery engine does not search on technology at all, so this list
  // exists for the saved ICP and for the agency to read.
  const technologies = tallyBySeed(rows.map((r) => r.technologies ?? []))
    .filter((t) => t.seeds >= 2)
    .map((t) => t.label)
    .slice(0, 12);

  const businessModelTally = tallyBySeed(rows.map((r) => (r.businessModel ? [r.businessModel] : [])));
  const businessModelsSharedByTwo = businessModelTally.filter((t) => t.seeds >= 2);
  const businessModels = (
    businessModelsSharedByTwo.length > 0 ? businessModelsSharedByTwo : businessModelTally
  )
    .map((t) => t.label)
    .slice(0, 3);

  const geographies = tallyBySeed(
    rows.map((r) => {
      const country = countryFromHeadquarters(r.headquarters);
      return country ? [country] : [];
    })
  )
    .map((t) => t.label)
    .slice(0, 4);

  // ── Size ──────────────────────────────────────────────────────────────────
  // Reported exactly as observed, with no widening.
  //
  // An earlier version halved the floor and doubled the ceiling, reasoning that
  // three customers are a sample of a distribution rather than its edges, so
  // searching a twenty-person window would return almost nothing. Both halves of
  // that were wrong. Nothing searches on these numbers: `sizeBucketFor` maps the
  // band onto one of the six fixed discovery buckets and the *bucket* is what
  // reaches the query, so the breadth was already there. And widening on top of it
  // pushed the chosen bucket a notch too high — measured against "which bucket
  // actually contains the most of these companies" across eighteen realistic
  // cohorts, the widened band agreed 10 times and the observed band 16, with every
  // disagreement in the too-large direction. Two customers of 600 and 800 people
  // came out as "1000+".
  const bounds = rows
    .map(sizeBoundsForRow)
    .filter((b): b is { min: number; max: number | null } => b !== null);

  let companySizeMin: number | null = null;
  let companySizeMax: number | null = null;

  if (bounds.length > 0) {
    companySizeMin = Math.min(...bounds.map((b) => b.min));
    // One "1000+" seed makes the whole band open-ended. Inventing a ceiling for
    // it would be a number nobody observed.
    const openEnded = bounds.some((b) => b.max === null);
    companySizeMax = openEnded ? null : Math.max(...bounds.map((b) => b.max as number));
  }

  // ── How much any of this can be trusted ───────────────────────────────────
  const shared = {
    industry: industriesSharedByTwo.length > 0,
    size: bounds.length >= 2,
    technology: technologies.length > 0,
  };

  const agreements = [shared.industry, shared.size, shared.technology].filter(Boolean).length;

  // HIGH needs three seeds as well as two agreements: with only two companies,
  // "both are in software" is a coincidence as easily as a pattern.
  const confidence: LookalikeConfidence =
    seedCount >= 3 && agreements >= 2 ? "HIGH" : agreements >= 1 ? "MEDIUM" : "LOW";

  return {
    industries,
    technologies,
    businessModels,
    geographies,
    companySizeMin,
    companySizeMax,
    seedCount,
    shared,
    confidence,
    confidenceReason: describeConfidence(seedCount, shared),
  };
}

/**
 * Count how many *seeds* mention each value, case-insensitively, keeping the
 * first spelling seen as the label. Sorted by agreement, then alphabetically so
 * the same input always produces the same list.
 */
function tallyBySeed(perSeed: string[][]): { label: string; seeds: number }[] {
  const byKey = new Map<string, { label: string; seeds: number }>();

  for (const values of perSeed) {
    const countedForThisSeed = new Set<string>();

    for (const raw of values) {
      const label = typeof raw === "string" ? raw.trim() : "";
      if (!label) continue;

      const key = label.toLowerCase();
      // A company listing "HubSpot" twice is still one company using HubSpot.
      if (countedForThisSeed.has(key)) continue;
      countedForThisSeed.add(key);

      const existing = byKey.get(key);
      if (existing) existing.seeds += 1;
      else byKey.set(key, { label, seeds: 1 });
    }
  }

  return [...byKey.values()].sort((a, b) => b.seeds - a.seeds || a.label.localeCompare(b.label));
}

/** Employee bounds for one company, preferring a real count over a range string. */
function sizeBoundsForRow(row: LookalikeSeedRow): { min: number; max: number | null } | null {
  if (typeof row.employeeCount === "number" && Number.isFinite(row.employeeCount) && row.employeeCount > 0) {
    return { min: row.employeeCount, max: row.employeeCount };
  }
  return parseEmployeeRange(row.employeeRange);
}

/**
 * Read an employee-range string into numbers.
 *
 * These strings come from two places with different habits: the discovery form
 * writes clean buckets like "51-200", and `ingestDomain` writes whatever the
 * model inferred from a homepage — "11-50", "500+", "about 200", and very often
 * the literal "Unknown". Anything unparseable returns null and simply does not
 * contribute, which is the point: a company whose size we do not know must not
 * quietly widen the band to include everybody.
 */
export function parseEmployeeRange(value: string | null | undefined): { min: number; max: number | null } | null {
  if (!value) return null;

  const cleaned = value
    // Thousands separators come off first. Turning "1,000-5,000" into
    // "1 000-5 000" makes the range pattern below read it as 0 to 5, which then
    // fails the positive check and discards a perfectly good answer.
    .replace(/(\d),(\d)/g, "$1$2")
    .replace(/,/g, " ")
    .trim();
  if (!cleaned) return null;

  // "51-200", "51 – 200", "51 to 200"
  const range = cleaned.match(/(\d+)\s*(?:-|–|—|to)\s*(\d+)/i);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (min > 0 && max > 0) {
      // Tolerate a reversed range rather than discarding a real answer.
      return { min: Math.min(min, max), max: Math.max(min, max) };
    }
    return null;
  }

  // "1000+", "500 plus"
  const open = cleaned.match(/(\d+)\s*(?:\+|plus\b)/i);
  if (open) {
    const min = Number(open[1]);
    return min > 0 ? { min, max: null } : null;
  }

  // A bare number, possibly with words round it: "about 200 employees".
  const single = cleaned.match(/(\d+)/);
  if (single) {
    const n = Number(single[1]);
    return n > 0 ? { min: n, max: n } : null;
  }

  return null;
}

/**
 * Best guess at a country from a `headquarters` string.
 *
 * `ingestDomain` stores "city, country/state" — "Austin, TX", "London, UK",
 * "Berlin, Germany" — and `Company.country` is never populated, so this is the
 * only geography available. Taking the last comma-separated piece is right for
 * all three of those; the two-letter case is the one that needs help, because a
 * bare "TX" is a US state and would otherwise be sent to the search engine as if
 * it were a country.
 *
 * Deliberately not a fifty-state lookup table, and deliberately not a model call.
 * This is a *suggestion* the agency confirms in an editable field before anything
 * searches on it, so the right amount of cleverness here is very little. "UK" is
 * the one two-letter exception common enough to be worth naming.
 */
export function countryFromHeadquarters(headquarters: string | null | undefined): string | null {
  if (!headquarters) return null;

  const parts = headquarters
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (parts.length === 0) return null;

  const last = parts[parts.length - 1];

  if (/^(uk|gb)$/i.test(last)) return "United Kingdom";
  if (/^usa?$/i.test(last)) return "United States";
  // Any other bare two-letter token in this position is a US state
  // abbreviation far more often than it is anything else.
  if (/^[A-Za-z]{2}$/.test(last)) return "United States";

  return last;
}

/** The confidence line the agency reads, assembled from what actually agreed. */
function describeConfidence(
  seedCount: number,
  shared: { industry: boolean; size: boolean; technology: boolean }
): string {
  const agreed: string[] = [];
  if (shared.industry) agreed.push("industry");
  if (shared.size) agreed.push("company size");
  if (shared.technology) agreed.push("technology");

  const noun = seedCount === 1 ? "company" : "companies";

  if (agreed.length === 0) {
    return `Read ${seedCount} ${noun}, but they had no ${
      seedCount === 1 ? "pattern to compare against" : "shared industry, size or technology"
    }. Treat this profile as a starting point and edit it before searching.`;
  }

  const list =
    agreed.length === 1
      ? agreed[0]
      : `${agreed.slice(0, -1).join(", ")} and ${agreed[agreed.length - 1]}`;

  const missing: string[] = [];
  if (!shared.industry) missing.push("industry");
  if (!shared.size) missing.push("company size");
  if (!shared.technology) missing.push("technology");

  const tail = missing.length > 0 ? ` We could not establish a shared ${missing.join(" or ")}.` : "";

  return `Read ${seedCount} ${noun} and found a shared ${list}.${tail}`;
}

// ─────────────────────────────────────────────────────────────
// THE NARRATIVE HALF
// ─────────────────────────────────────────────────────────────

/**
 * Ask the model to name and describe the pattern, and nothing else.
 *
 * Given the computed facts and the seeds' own homepage descriptions. The
 * descriptions are what make `keywords` useful — "industry: Software" cannot
 * distinguish a payroll tool from a game engine, but two paragraphs of their own
 * copy can, and the keyword is what the discovery engine actually searches on.
 */
async function describeLookalikeProfile(
  rows: LookalikeSeedRow[],
  profile: SharedProfile
): Promise<z.infer<typeof LookalikeNarrativeSchema>> {
  const seedBlocks = rows
    .map((r, i) => {
      const lines = [
        `Company ${i + 1}: ${r.name}${r.domain ? ` (${r.domain})` : ""}`,
        r.industry ? `Industry: ${r.industry}` : null,
        r.businessModel ? `Business model: ${r.businessModel}` : null,
        r.headquarters ? `Headquarters: ${r.headquarters}` : null,
        r.employeeRange && !/^unknown$/i.test(r.employeeRange) ? `Size: ${r.employeeRange}` : null,
        r.foundedYear ? `Founded: ${r.foundedYear}` : null,
        r.technologies?.length ? `Technology: ${r.technologies.slice(0, 10).join(", ")}` : null,
        // Capped per company so five verbose homepages cannot crowd out the
        // instructions at the end of the prompt.
        r.description ? `What they do: ${r.description.slice(0, 700)}` : null,
      ].filter(Boolean);
      return lines.join("\n");
    })
    .join("\n\n");

  const factLines = [
    profile.industries.length ? `Industries present: ${profile.industries.join(", ")}` : null,
    profile.businessModels.length ? `Business models: ${profile.businessModels.join(", ")}` : null,
    profile.geographies.length ? `Countries: ${profile.geographies.join(", ")}` : null,
    profile.companySizeMin !== null
      ? `Employee band: ${profile.companySizeMin}-${profile.companySizeMax ?? "and up"}`
      : null,
    profile.technologies.length ? `Shared technology: ${profile.technologies.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `You are helping an agency understand the pattern in its own client list.

Below are ${rows.length} companies that are all existing, successful clients of this agency. Your job is to work out what they have in common, so the agency can go and find more companies like them.

THE COMPANIES
${seedBlocks}

ALREADY ESTABLISHED (computed from their records — treat as fact, do not contradict)
${factLines || "Nothing beyond the descriptions above."}

WHAT TO RETURN
1. "name" — a short label for this type of company, under 60 characters, the way an agency would say it out loud. Example shape: "Mid-market DTC skincare brands". Be specific to these companies; a label that would fit any B2B company is useless.
2. "description" — one paragraph, 2-4 sentences, on what these companies have in common and why an agency would want more of them. Ground every claim in the companies above. If they are genuinely dissimilar, say so plainly instead of inventing a connection.
3. "keywords" — 2 to 4 short search phrases (each under ${KEYWORD_MAX_LENGTH} characters) that would find similar companies on the web. These become live web searches, so they must be the words such a company would actually use about itself. Prefer a specific niche ("DTC skincare", "freight brokerage") over a broad category ("SaaS", "technology"). No boolean operators, no quotes, no site: filters.
4. "sharedTraits" — 3 to 5 short observations these companies have in common, one sentence each. Only state things visible in the material above.

Do not invent industries, employee counts, funding, locations or technologies that are not stated above.

You must return valid JSON matching this schema exactly:
{
  "name": "string",
  "description": "string",
  "keywords": ["string"],
  "sharedTraits": ["string"]
}`;

  let response;
  let retries = 0;
  const maxRetries = 3;

  while (retries < maxRetries) {
    try {
      response = await ai.chat.completions.create({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });
      break;
    } catch (err) {
      retries++;
      console.warn(`Lookalike narrative attempt ${retries} failed:`, err);
      if (retries >= maxRetries) throw err;
      await new Promise((resolve) => setTimeout(resolve, retries * 1000));
    }
  }

  return parseAIResponse(
    response?.choices[0]?.message?.content,
    LookalikeNarrativeSchema,
    "Lookalike profile failed"
  );
}

/**
 * Clean the model's lists into something safe to store and to search on.
 *
 * Every cap here has a downstream reason rather than being a general precaution:
 * keywords are sliced to the same length `searchForTargetsWithAI` slices them to,
 * so what the agency sees is what actually gets searched; and they are capped at
 * four because each one becomes three web queries.
 */
export function tidyNarrative(narrative: {
  name: string;
  description: string;
  keywords: string[];
  sharedTraits: string[];
}): { name: string; description: string; keywords: string[]; sharedTraits: string[] } {
  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const raw of narrative.keywords) {
    // Quotes and boolean operators break the query builder's own quoting, and
    // the prompt asks for neither — strip rather than reject, so one stray
    // character does not cost the agency a keyword.
    const cleaned = raw
      .replace(/["'()]/g, " ")
      .replace(/\b(AND|OR|NOT)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, KEYWORD_MAX_LENGTH)
      .trim();

    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    keywords.push(cleaned);
    if (keywords.length >= MAX_KEYWORDS) break;
  }

  return {
    name: narrative.name.trim().slice(0, 80),
    description: narrative.description.trim().slice(0, 900),
    keywords,
    sharedTraits: narrative.sharedTraits
      .map((t) => t.trim().slice(0, 240))
      .filter((t) => t.length > 0)
      .slice(0, 6),
  };
}

// ─────────────────────────────────────────────────────────────
// THE BACKGROUND JOB
// ─────────────────────────────────────────────────────────────

export interface RunLookalikeParams {
  workspaceId: string;
  agentRunId: string;
  /** Already normalised to bare hostnames by the caller. */
  domains: string[];
}

/**
 * Read the seed companies and build the profile.
 *
 * Same shape as `runDiscoveryEngine` and `runGrowthAuditEngine`: started without
 * being awaited, owns its own error handling, and always drives the `AgentRun` to
 * a terminal status so the UI's poll cannot spin forever.
 *
 * The profile lands on `AgentRun.outputData`. There is no `LookalikeProfile`
 * table because there would be nothing in it that this JSON column does not
 * already hold — the profile is a draft the agency edits and then saves into the
 * `ICP` row that already exists, so its permanent home is `ICP`, not a table of
 * its own.
 */
export async function runLookalikeEngine(params: RunLookalikeParams): Promise<void> {
  const { workspaceId, agentRunId } = params;
  const domains = params.domains.slice(0, MAX_SEED_DOMAINS);

  try {
    await prisma.agentRun.update({
      where: { id: agentRunId },
      data: { status: "RUNNING", startedAt: new Date(), totalItems: domains.length },
    });

    await logActivity(
      workspaceId,
      "START_LOOKALIKE",
      "Started Lookalike Search",
      `Reading ${domains.length} customer ${domains.length === 1 ? "website" : "websites"} to work out what they have in common.`
    );

    // ── Read the seeds ────────────────────────────────────────────────────
    // Batched three at a time, the same concurrency `runDiscoveryEngine` uses,
    // for the same reason: it cuts wall-clock time without bursting the Jina and
    // Groq free-tier per-minute ceilings.
    //
    // Both kinds of `ingestDomain` failure are caught per domain, including the
    // hard ones it deliberately rethrows. Discovery can afford to lose one domain
    // out of forty and an audit cannot afford to lose its only one; this sits
    // between the two — losing one seed of four is survivable, losing three is
    // not, so the decision is deferred to the count check below.
    const outcomes: LookalikeSeedOutcome[] = [];

    const readOne = async (domain: string): Promise<LookalikeSeedOutcome> => {
      try {
        const result = await ingestDomain({
          domain,
          workspaceId,
          // Tagged distinctly so these rows can be told apart from real
          // prospects later: they are the agency's own customers, and they are
          // in the workspace as the benchmark the profile was built from, not as
          // something to sell to.
          source: "lookalike-seed",
          agentRunId,
        });

        if (!result.companyId) {
          await logActivity(
            workspaceId,
            "SCRAPE_FAILED",
            `Could not read ${domain}`,
            result.reason ?? "Failed to extract anything usable from the site."
          );
          return { domain, name: null, companyId: null, skippedReason: result.reason ?? "Could not read the site." };
        }

        return { domain, name: result.name, companyId: result.companyId, skippedReason: null };
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : "Unknown error";
        console.error(`Lookalike seed failed for ${domain}:`, err);
        await logActivity(workspaceId, "SCRAPE_FAILED", `Error reading ${domain}`, reason);
        return { domain, name: null, companyId: null, skippedReason: reason };
      }
    };

    const BATCH_SIZE = 3;
    for (let i = 0; i < domains.length; i += BATCH_SIZE) {
      const batch = domains.slice(i, i + BATCH_SIZE);
      outcomes.push(...(await Promise.all(batch.map(readOne))));
    }

    const usableIds = outcomes.map((o) => o.companyId).filter((id): id is string => id !== null);

    if (usableIds.length < MIN_SEED_DOMAINS) {
      // Name the domains that failed and why. "Not enough companies" on its own
      // is unactionable — the agency needs to know whether to fix a typo, pick a
      // different customer, or try again in a minute.
      const failures = outcomes
        .filter((o) => o.companyId === null)
        .map((o) => `${o.domain} (${o.skippedReason ?? "unreadable"})`)
        .join("; ");

      throw new Error(
        `Only ${usableIds.length} of ${domains.length} sites could be read, and a profile needs at least ${MIN_SEED_DOMAINS}. ` +
          `Could not read: ${failures}. Try different customers, or check the addresses.`
      );
    }

    // ── Compute, then describe ────────────────────────────────────────────
    const rows = await prisma.company.findMany({
      where: { id: { in: usableIds }, workspaceId },
      select: {
        name: true,
        domain: true,
        description: true,
        industry: true,
        businessModel: true,
        employeeCount: true,
        employeeRange: true,
        technologies: true,
        headquarters: true,
        foundedYear: true,
      },
    });

    const profile = computeSharedProfile(rows);

    await logActivity(
      workspaceId,
      "AI_ANALYSIS",
      "Building the shared profile",
      profile.confidenceReason
    );

    const narrative = tidyNarrative(await describeLookalikeProfile(rows, profile));

    const stored: StoredLookalikeProfile = {
      ...profile,
      ...narrative,
      seeds: outcomes,
    };

    await prisma.agentRun.update({
      where: { id: agentRunId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        resultSummary: narrative.name,
        outputData: stored as unknown as Prisma.InputJsonValue,
      },
    });

    await logActivity(
      workspaceId,
      "RUN_COMPLETE",
      "Lookalike profile ready",
      `Built "${narrative.name}" from ${rows.length} of your customers.`
    );
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "An unexpected error occurred.";
    console.error("Lookalike Engine Error:", error);

    await logActivity(workspaceId, "RUN_ERROR", "Lookalike Search Failed", reason);

    await prisma.agentRun.update({
      where: { id: agentRunId },
      data: { status: "FAILED", errorMessage: reason, completedAt: new Date() },
    });
  }
}

// ─────────────────────────────────────────────────────────────
// THE READ PATH
// ─────────────────────────────────────────────────────────────

const StoredLookalikeProfileSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  keywords: z.array(z.string()).nullish().transform((v) => v ?? []),
  sharedTraits: z.array(z.string()).nullish().transform((v) => v ?? []),
  industries: z.array(z.string()).nullish().transform((v) => v ?? []),
  technologies: z.array(z.string()).nullish().transform((v) => v ?? []),
  businessModels: z.array(z.string()).nullish().transform((v) => v ?? []),
  geographies: z.array(z.string()).nullish().transform((v) => v ?? []),
  companySizeMin: z.number().nullish().transform((v) => v ?? null),
  companySizeMax: z.number().nullish().transform((v) => v ?? null),
  seedCount: z.number(),
  shared: z.object({
    industry: z.boolean(),
    size: z.boolean(),
    technology: z.boolean(),
  }),
  // Unlike the audit's enums this one is *not* `.catch()`-ed. A confidence label
  // is a claim about how much to trust the rest of the object, so silently
  // defaulting a corrupt value to MEDIUM would be the one coercion here that
  // could actively mislead. A profile is also cheap to regenerate — nothing has
  // been sent to anybody — so failing the parse and offering a rerun is a better
  // trade than it was for an audit already in a prospect's inbox.
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  confidenceReason: z.string(),
  seeds: z
    .array(
      z.object({
        domain: z.string(),
        name: z.string().nullish().transform((v) => v ?? null),
        companyId: z.string().nullish().transform((v) => v ?? null),
        skippedReason: z.string().nullish().transform((v) => v ?? null),
      })
    )
    .nullish()
    .transform((v) => v ?? []),
});

/**
 * Validate an `AgentRun.outputData` blob on the way out of the database.
 *
 * Returns null rather than throwing, so a page that finds a malformed profile can
 * offer to build a new one instead of rendering an error — the same contract as
 * `parseStoredAuditContent`, and for the same reason: `outputData` is `Json?`, so
 * TypeScript believes it is `any` and the compiler cannot help here at all.
 */
export function parseStoredLookalikeProfile(outputData: unknown): StoredLookalikeProfile | null {
  const result = StoredLookalikeProfileSchema.safeParse(outputData);
  return result.success ? result.data : null;
}
