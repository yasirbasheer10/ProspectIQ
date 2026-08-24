"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { checkAuditRunStatus } from "./actions";

/**
 * Polls a growth audit run to completion and drives the loading overlay.
 *
 * Deliberately a near-copy of `useDiscoveryPolling` — same two runaway guards,
 * same constants, same `onSettled` contract — because the two features fail in
 * exactly the same ways and there is no reason for the recovery behaviour to
 * differ. The one real difference is how progress is reported; see below.
 *
 * Two ways the poll could otherwise spin forever, both guarded here:
 *   1. `checkAuditRunStatus` failing repeatedly (a session hiccup, a network
 *      blip): we stop after MAX_CONSECUTIVE_FAILURES rather than retrying every
 *      2s forever.
 *   2. the run never reaching a terminal status server-side: we give up after
 *      MAX_POLL_MS and say it may still be running, instead of leaving the UI
 *      spinning with no way out.
 *
 * ── Why the step is real here and faked in discovery ─────────────────────────
 *
 * `useDiscoveryPolling` can only jump to step 3 on RUNNING, because an AgentRun
 * status is all it has. An audit run exposes one extra fact: `auditId` is null
 * until `ingestDomain` has produced a company, and non-null forever after. So
 * "RUNNING with no audit row" genuinely means *still reading their site* and
 * "RUNNING with an audit row" genuinely means *researching and writing*. Those
 * two are the slow halves, and this is honest progress rather than a timer.
 */

const POLL_INTERVAL_MS = 2000;
const MAX_CONSECUTIVE_FAILURES = 5;
const MAX_POLL_MS = 10 * 60 * 1000; // 10 minutes

/** 0 idle · 1 reading their site · 2 researching · 3 writing · 4 done */
export type AuditStep = 0 | 1 | 2 | 3 | 4;

export function useAuditPolling({
  runId,
  onSettled,
}: {
  runId: string | null;
  /** Called once when the run reaches a terminal state or a guard trips.
   *  `error` is null on success. */
  onSettled: (error: string | null) => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<AuditStep>(0);

  useEffect(() => {
    if (!runId) return;

    const startedAt = Date.now();
    let consecutiveFailures = 0;
    let settled = false;

    const finish = (error: string | null) => {
      if (settled) return;
      settled = true;
      clearInterval(interval);
      onSettled(error);
    };

    const interval = setInterval(async () => {
      if (Date.now() - startedAt > MAX_POLL_MS) {
        finish(
          "This audit is taking much longer than expected. It may still be running in the background — check your audits list in a few minutes, or try again."
        );
        return;
      }

      try {
        const status = await checkAuditRunStatus(runId);
        consecutiveFailures = 0; // reset on any successful check, even if still RUNNING

        if (status.status === "COMPLETED") {
          setStep(4);
          finish(null);
          // Brief pause so the last tick is visible before we leave.
          // `auditId` should always exist by now — the engine completes the audit
          // row before the run — but falling back to the list beats pushing
          // /audits/null if that assumption ever breaks.
          const href = status.auditId ? `/audits/${status.auditId}` : "/audits";
          setTimeout(() => router.push(href), 500);
        } else if (status.status === "FAILED") {
          // Show the reason the engine recorded, not just "it failed". A site
          // that blocks scrapers, a domain that does not resolve and a model
          // outage read very differently, and only some are worth retrying.
          finish(status.errorMessage || "This audit failed. Please try again.");
        } else if (status.status === "RUNNING") {
          setStep(status.auditId ? 3 : 2);
        } else {
          // QUEUED: the engine has not picked it up yet.
          setStep(1);
        }
      } catch (err) {
        console.error("Audit polling error:", err);
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          finish(
            "Lost connection while checking the audit status. Please check your audits list, or try again."
          );
        }
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
    // onSettled is intentionally excluded: the caller passes a stable
    // useCallback, and re-subscribing on every render would reset the poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, router]);

  return { step, setStep };
}
