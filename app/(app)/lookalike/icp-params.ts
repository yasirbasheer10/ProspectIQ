import { parseEmployeeRange } from "@/lib/ai/lookalike";
import { SIZE_BUCKETS } from "../discovery/constants";

/**
 * The adapter between a lookalike profile and the discovery engine's ICP params.
 *
 * It lives here, in the app layer, rather than in `lib/ai/lookalike.ts`, because
 * `SIZE_BUCKETS` is the contract between the *discovery form* and the engine — the
 * strings are sent to the search query verbatim. `lib/` computes facts about
 * companies; deciding which of six fixed dropdown options best represents those
 * facts is a UI concern, and importing an app-route constant into `lib/` to do it
 * would have the dependency pointing the wrong way.
 *
 * No `"use server"` here on purpose: this is a pure module so it can be imported
 * by both the server action and a test without dragging in a session or a
 * database.
 *
 * It must NOT be imported by `LookalikeClient`, though — it reaches into
 * `lib/ai/lookalike.ts` for `parseEmployeeRange`, and that file imports Prisma and
 * the Groq client, which have no business in a browser bundle. The client gets the
 * chosen bucket as a prop, already computed on the server, and reads the option
 * list straight from `discovery/constants` (which imports nothing).
 */

/** Stands in for "no upper bound" so the overlap arithmetic stays finite. */
const OPEN_ENDED = 1_000_000;

/**
 * Pick the size bucket that best represents a computed employee band.
 *
 * The profile reports a real range — say 55 to 70 people — and the discovery
 * engine accepts exactly one of six fixed buckets, so something has to choose.
 *
 * It chooses by how much of the band each bucket covers. That matters because the
 * buckets are wildly uneven in width — "11-50" spans forty people and "51-200"
 * spans a hundred and fifty — so a rule based on where the midpoint lands would
 * flip its answer depending on which side of an arbitrary boundary the middle of
 * the band happened to fall, even when almost all of the band sits in one bucket.
 *
 * The band handed in is the one actually observed across the seed companies, not a
 * widened version of it. That is load-bearing: the bucket is itself a wide window,
 * so widening the band first double-counts and reliably picks a bucket one notch
 * too big. The size section of `computeSharedProfile` records the measurement.
 *
 * Returns null when there is no band at all, or when the band somehow overlaps
 * none of the buckets — better to search every size than to assert a wrong one.
 */
export function sizeBucketFor(min: number | null, max: number | null): string | null {
  if (min === null || min <= 0) return null;

  const bandLo = min;
  const bandHi = max === null ? OPEN_ENDED : Math.max(max, min);

  let best: { bucket: string; overlap: number } | null = null;

  for (const bucket of SIZE_BUCKETS) {
    const bounds = parseEmployeeRange(bucket);
    if (!bounds) continue;

    const lo = bounds.min;
    const hi = bounds.max === null ? OPEN_ENDED : bounds.max;

    // Inclusive on both ends: "11-50" and a band of exactly 50-50 do overlap.
    const overlap = Math.min(bandHi, hi) - Math.max(bandLo, lo) + 1;
    if (overlap <= 0) continue;

    // Strictly greater, so an earlier (smaller) bucket wins a tie. With a band
    // that straddles two buckets evenly, the smaller one is the safer guess:
    // agencies overwhelmingly sell to companies smaller than they estimate.
    if (!best || overlap > best.overlap) best = { bucket, overlap };
  }

  return best?.bucket ?? null;
}
