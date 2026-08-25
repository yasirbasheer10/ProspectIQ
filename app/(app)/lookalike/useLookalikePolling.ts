"use client";

import { useEffect, useState } from "react";
import { checkLookalikeRunStatus } from "./actions";

/**
 * Polls a run started from the lookalike screen and reports how it ended.
 *
 * Deliberately thinner than `useAuditPolling` and `useDiscoveryPolling`, which
 * both own the navigation that follows. This screen runs two different kinds of
 * run — building the profile, then searching with it — and they end in different
 * places, so the hook reports the outcome and the caller decides. Trying to make
 * one hook know both would mean passing it the very phase flag the caller already
 * holds.
 *
 * The two runaway guards are copied from the other two hooks unchanged, because
 * the failures are the same and there is no reason for the recovery to differ:
 *   1. `checkLookalikeRunStatus` failing repeatedly (a session hiccup, a network
 *      blip) stops after MAX_CONSECUTIVE_FAILURES rather than retrying forever.
 *   2. a run that never reaches a terminal status server-side gives up after
 *      MAX_POLL_MS, instead of leaving the UI spinning with no way out.
 */

const POLL_INTERVAL_MS = 2000;
const MAX_CONSECUTIVE_FAILURES = 5;
const MAX_POLL_MS = 10 * 60 * 1000; // 10 minutes

export function useLookalikeRunPolling({
  runId,
  timeoutMessage,
  onSettled,
}: {
  runId: string | null;
  /** What to say if the run outlives MAX_POLL_MS — the two phases differ. */
  timeoutMessage: string;
  /** Called once when the run reaches a terminal state or a guard trips.
   *  `error` is null on success. */
  onSettled: (error: string | null) => void;
}) {
  /**
   * How many polls have come back, tagged with the run they belong to. Drives the
   * progress bar only.
   *
   * Tagged rather than reset. This screen, unlike the audit and discovery ones,
   * stays mounted across two runs in a row, so the count from the first must not
   * leak into the second one's progress bar. The obvious way to stop that —
   * `setTicks(0)` when `runId` goes null — is a setState in an effect body, which
   * React's `set-state-in-effect` rule rejects, and rightly: it renders once
   * showing the finished run's count and then corrects itself. Keeping the id
   * beside the count lets a stale value be ignored during render instead of
   * overwritten after it.
   */
  const [progress, setProgress] = useState<{ runId: string | null; ticks: number }>({
    runId: null,
    ticks: 0,
  });

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
        finish(timeoutMessage);
        return;
      }

      try {
        const status = await checkLookalikeRunStatus(runId);
        consecutiveFailures = 0; // reset on any successful check, even if still RUNNING
        setProgress((p) => ({ runId, ticks: p.runId === runId ? p.ticks + 1 : 1 }));

        if (status.status === "COMPLETED") {
          finish(null);
        } else if (status.status === "FAILED") {
          // Show the reason the engine recorded rather than "it failed". A site
          // that blocks scrapers, two customers with nothing in common and a
          // model outage read very differently, and only some are worth retrying.
          finish(status.errorMessage || "That run failed. Please try again.");
        }
      } catch (err) {
        console.error("Lookalike polling error:", err);
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          finish("Lost connection while checking on this. Please reload the page and try again.");
        }
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
    // onSettled and timeoutMessage are intentionally excluded: the caller passes
    // a stable useCallback and a constant, and re-subscribing on every render
    // would reset the poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  // Derived during render, so a count belonging to a finished run is never shown
  // even for one frame.
  const ticks = progress.runId === runId ? progress.ticks : 0;

  return { ticks };
}
