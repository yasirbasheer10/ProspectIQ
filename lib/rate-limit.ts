/**
 * A fixed-window rate limiter held in process memory.
 *
 * Honest about what this is: on Vercel each serverless instance has its own
 * heap, so the effective limit is `max` per instance per window, not `max`
 * globally, and a cold start resets the counter. That is still enough to stop
 * the case this exists for — a script hammering one endpoint from one place
 * gets pinned to one warm instance — but it is not a substitute for a shared
 * store. Swap the two functions below for Upstash/Redis if this ever needs to
 * hold under a distributed attempt.
 *
 * Anything that must be enforced exactly belongs in the database instead. See
 * the per-email check in app/api/auth/register/route.ts, which is durable
 * because it reads the `verification_tokens` table.
 */

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

/** Drop expired entries so a long-lived instance doesn't grow unbounded. */
function sweep(now: number) {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

export type RateLimitResult = {
  ok: boolean;
  /** Seconds until the window resets. Suitable for a Retry-After header. */
  retryAfter: number;
};

export function rateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  // Cheap amortised cleanup: only walk the map when it has grown.
  if (windows.size > 500) sweep(now);

  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  existing.count += 1;

  if (existing.count > max) {
    return { ok: false, retryAfter: Math.ceil((existing.resetAt - now) / 1000) };
  }

  return { ok: true, retryAfter: 0 };
}

/**
 * Best-effort client address.
 *
 * `x-forwarded-for` is set by Vercel's edge and is trustworthy there; running
 * behind anything else, it is caller-controlled and can be forged. Treated as a
 * bucketing hint, which is why the durable per-email limit exists alongside it.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
