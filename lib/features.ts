/**
 * Flags for the parts of this app that are built but not finished.
 *
 * Two features have database tables, pages and buttons, but no engine behind
 * them. Left as they were they read as shipped — a "Create Sequence" button that
 * does nothing, an "Approve & Send" button that sends nothing — which is the same
 * class of problem as the fabricated data cleared out in P0: the screen claims
 * something the system cannot do. Rather than delete work that is most of the way
 * there, both are gated here and the UI says plainly that they are not available.
 *
 * Both default to off. Set the env var to `"true"` to turn one on — which is the
 * point of the flag: whoever finishes the feature flips one value instead of
 * hunting for the places it was commented out.
 *
 * ## `sequences`
 * `Sequence` and `SequenceStep` exist and `sequences/page.tsx` reads them, but
 * nothing creates a sequence outside `lib/demo/seed.ts` and no code executes a
 * step. There is no scheduler, so a multi-touch sequence has nothing to advance
 * it between touches.
 *
 * ## `outboundSending`
 * `lib/email.ts` is wired to Resend but only ever called for email verification
 * and password reset. Nothing in the app sets an `OutreachMessage` to `SENT`, and
 * approving a conversation reply records the reply without transmitting it.
 * Turning this on is not just a label change — it needs a real send path, and
 * that path has to run somewhere durable. The pipeline currently runs in
 * fire-and-forget server actions that a serverless timeout can kill mid-flight
 * (see `lib/ai/stale-runs.ts` for the symptom), so sending from there would drop
 * mail silently. `assertNotSuppressed` is already enforced on the `SENT`
 * transition, so the do-not-contact check is in place waiting for it.
 */

function envFlag(name: string): boolean {
  return process.env[name] === "true";
}

export const FEATURES = {
  sequences: envFlag("ENABLE_SEQUENCES"),
  outboundSending: envFlag("ENABLE_OUTBOUND_SENDING"),
} as const;

/**
 * The message shown, and thrown, when something tries to send while sending is
 * off. One string so the UI and the server action cannot drift apart.
 */
export const OUTBOUND_DISABLED_REASON =
  "Outbound sending is not enabled. Drafts can be written, edited and approved, " +
  "but nothing is transmitted — there is no send path yet.";
