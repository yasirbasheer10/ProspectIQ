"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { checkRunStatus } from "./actions";

/**
 * Polls a discovery run to completion and drives the loading overlay.
 *
 * This was ~55 lines of `useEffect` inside `DiscoveryClient`. It is self-contained
 * — give it a run id and it owns the polling, the terminal-status handling and the
 * two runaway guards — so it moved out whole.
 *
 * Two ways the poll could otherwise spin forever, both guarded here:
 *   1. `checkRunStatus` failing repeatedly (a session hiccup, a network blip): we
 *      stop after MAX_CONSECUTIVE_FAILURES rather than retrying every 2s forever.
 *   2. the run never reaching a terminal status server-side: we give up after
 *      MAX_POLL_MS and tell the user it may still be running in the background,
 *      instead of leaving the UI "scanning" with no way out.
 */

const POLL_INTERVAL_MS = 2000;
const MAX_CONSECUTIVE_FAILURES = 5;
const MAX_POLL_MS = 10 * 60 * 1000; // 10 minutes

export type DiscoveryStep = 0 | 1 | 2 | 3 | 4;

export function useDiscoveryPolling({
  runId,
  onSettled,
}: {
  runId: string | null;
  /** Called once when the run reaches a terminal state or a guard trips.
   *  `error` is null on success. */
  onSettled: (error: string | null) => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<DiscoveryStep>(0);

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
          "Discovery is taking much longer than expected. It may still be running in the background — check the Companies list in a few minutes, or try again."
        );
        return;
      }

      try {
        const status = await checkRunStatus(runId);
        consecutiveFailures = 0; // reset on any successful check, even if still RUNNING

        if (status.status === "COMPLETED") {
          setStep(4);
          finish(null);
          // Brief pause so the "Finalizing" tick is visible before we leave.
          setTimeout(() => router.push("/companies"), 500);
        } else if (status.status === "FAILED") {
          // Show the reason the engine recorded, not just "it failed". The engines
          // write a specific cause to AgentRun.errorMessage — a missing
          // SERPER_API_KEY reads very differently from an ICP that matched nothing,
          // and only one of them is worth retrying.
          finish(status.errorMessage || "Discovery run failed. Please try again.");
        } else if (status.status === "RUNNING") {
          setStep(3);
        }
      } catch (err) {
        console.error("Polling error:", err);
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          finish(
            "Lost connection while checking discovery status. Please check the Companies list, or try again."
          );
        }
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
    // onSettled is intentionally excluded: DiscoveryClient passes a stable
    // useCallback, and re-subscribing on every render would reset the poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, router]);

  return { step, setStep };
}
