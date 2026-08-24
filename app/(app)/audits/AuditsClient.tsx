"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, Check, Copy, FileText, Loader2, Sparkles, Trash2, X } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { startGrowthAudit, deleteGrowthAudit } from "./actions";
import { useAuditPolling } from "./useAuditPolling";

/**
 * The audits screen: one input, one button, a list of what has been produced.
 *
 * Deliberately the least configurable screen in the app. Discovery earns its ICP
 * form because the agency is describing a market; an audit is about one company
 * they have already chosen, so the only thing left to ask for is the address. Any
 * extra field here would be a field the agency has to fill in before they can see
 * whether the feature is worth using.
 */

export interface AuditListRow {
  id: string;
  status: string;
  headline: string | null;
  auditScore: number | null;
  auditGrade: string | null;
  viewCount: number;
  shareToken: string;
  createdAt: Date;
  companyName: string;
  companyDomain: string | null;
}

const STEP_LABELS = [
  "",
  "Starting",
  "Reading their website",
  "Researching and writing",
  "Done",
] as const;

export function AuditsClient({
  audits,
  usedThisMonth,
  monthlyLimit,
}: {
  audits: AuditListRow[];
  usedThisMonth: number;
  monthlyLimit: number;
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [runIdToPoll, setRunIdToPoll] = useState<string | null>(null);

  // Stable, so the polling effect does not resubscribe on every render.
  const handleSettled = useCallback((error: string | null) => {
    setRunIdToPoll(null);
    if (error) {
      setIsRunning(false);
      setErrorMsg(error);
    }
    // On success the hook navigates to the audit, so the overlay stays up until
    // it does — the alternative is a flash of this page before the redirect.
  }, []);

  const { step, setStep } = useAuditPolling({ runId: runIdToPoll, onSettled: handleSettled });

  const handleGenerate = async () => {
    setErrorMsg(null);
    setIsRunning(true);
    setStep(1);
    try {
      const res = await startGrowthAudit({ url });

      if (res?.runId) {
        setRunIdToPoll(res.runId);
      } else {
        // Without a run id there is nothing to poll, so the overlay would hang.
        setIsRunning(false);
        setErrorMsg("The audit did not start — no run was created. Please try again.");
      }
    } catch (e: unknown) {
      console.error(e);
      setIsRunning(false);
      setErrorMsg(
        e instanceof Error ? e.message : "Something went wrong starting the audit. Please try again."
      );
    }
  };

  const atLimit = usedThisMonth >= monthlyLimit;
  const generateDisabled = isRunning || atLimit || url.trim().length === 0;

  return (
    <div className="flex h-full flex-col bg-white">
      <Topbar
        title="Growth Audits"
        subtitle={`${usedThisMonth} of ${monthlyLimit} used this month`}
      />

      <main className="relative flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-4xl">
          {errorMsg && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-[#FF3B30]/20 bg-[#FF3B30]/10 p-4 text-[#FF3B30]">
              <X className="mt-0.5 shrink-0" size={18} />
              <p className="text-[14px] font-medium leading-tight">{errorMsg}</p>
            </div>
          )}

          {/* ── The input ─────────────────────────────────────────────────── */}
          <div className="rounded-xl border border-[#E5E5EA] bg-white p-6 shadow-apple-sm">
            <h2 className="text-[15px] font-semibold text-[#1D1D1F]">Audit a prospect</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-[#86868B]">
              Paste their website. We read it, research the company, and write a
              branded audit you can send them.
            </p>

            <form
              className="mt-4 flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                if (!generateDisabled) void handleGenerate();
              }}
            >
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="acme.com"
                spellCheck={false}
                autoCapitalize="off"
                disabled={isRunning || atLimit}
                className={cn(
                  "h-11 flex-1 rounded-lg border border-[#E5E5EA] px-4 text-[14px] text-[#1D1D1F]",
                  "placeholder:text-[#86868B] focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20",
                  "disabled:cursor-not-allowed disabled:bg-[#F5F5F7]"
                )}
              />
              <Button
                type="submit"
                variant="primary"
                size="lg"
                icon={Sparkles}
                loading={isRunning}
                disabled={generateDisabled}
              >
                {isRunning ? "Working" : "Generate audit"}
              </Button>
            </form>

            {atLimit && (
              <p className="mt-3 text-[12px] text-[#FF9500]">
                You have used all {monthlyLimit} audits for this month. The limit resets
                on the 1st.
              </p>
            )}
          </div>

          {/* ── The list ──────────────────────────────────────────────────── */}
          <div className="mt-8">
            {audits.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No audits yet"
                description="Audit a prospect's website above. You'll get a document with your own branding on it, ready to send."
              />
            ) : (
              <>
                <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#86868B]">
                  Your audits
                </h2>
                <ul className="divide-y divide-[#E5E5EA] overflow-hidden rounded-xl border border-[#E5E5EA]">
                  {audits.map((a) => (
                    <AuditRow key={a.id} audit={a} onChanged={() => router.refresh()} />
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>

        {/* ── Working overlay ───────────────────────────────────────────────
            Covers the page rather than sitting inline, because the run takes a
            minute or two and the agency should not be able to start a second one
            against a different domain while the first is mid-flight. */}
        {isRunning && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-xl border border-[#E5E5EA] bg-white p-6 text-center shadow-apple-lg">
              <Loader2 className="mx-auto animate-spin text-[#0071E3]" size={28} />
              <p className="mt-4 text-[15px] font-semibold text-[#1D1D1F]">
                {STEP_LABELS[step] || "Working"}
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[#86868B]">
                This usually takes a minute or two. Leave this open — we&rsquo;ll take
                you to the audit when it&rsquo;s ready.
              </p>
              <div className="mt-5 flex items-center justify-center gap-1.5">
                {[1, 2, 3, 4].map((s) => (
                  <span
                    key={s}
                    className={cn(
                      "h-1 w-8 rounded-full transition-colors duration-300",
                      step >= s ? "bg-[#0071E3]" : "bg-[#E5E5EA]"
                    )}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── One row ───────────────────────────────────────────────────

function AuditRow({ audit, onChanged }: { audit: AuditListRow; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyShareLink = async () => {
    // Built here rather than on the server: the server has no reliable idea what
    // origin the agency is actually using, and this is the origin they trust.
    const link = `${window.location.origin}/a/${audit.shareToken}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard is blocked outside a secure context and in some embedded
      // browsers. Falling back to a prompt beats a button that silently does
      // nothing, because the link is the entire point of the feature.
      window.prompt("Copy this link:", link);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await deleteGrowthAudit(audit.id);
      onChanged();
    } catch (e) {
      console.error(e);
      setBusy(false);
      setConfirming(false);
    }
  };

  const isDone = audit.status === "COMPLETED";
  const isFailed = audit.status === "FAILED";

  return (
    <li className="flex items-center gap-4 bg-white px-5 py-4 hover:bg-[#F5F5F7]/60">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[14px] font-medium text-[#1D1D1F]">
            {audit.companyName}
          </span>
          {isFailed && <Badge variant="danger" dot>Failed</Badge>}
          {!isDone && !isFailed && <Badge variant="warning" dot>Running</Badge>}
        </div>
        <p className="mt-0.5 truncate text-[13px] text-[#86868B]">
          {audit.headline || audit.companyDomain || "—"}
        </p>
        <p className="mt-1 text-[11px] text-[#86868B]">
          {audit.createdAt.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
          {audit.viewCount > 0 && (
            <>
              {" · "}
              {audit.viewCount === 1 ? "Viewed once" : `Viewed ${audit.viewCount} times`}
            </>
          )}
        </p>
      </div>

      {isDone && audit.auditGrade && (
        <span className="hidden shrink-0 text-[13px] font-medium tabular-nums text-[#4B5563] sm:block">
          {audit.auditScore !== null ? Math.round(audit.auditScore) : "—"}
          <span className="ml-1 text-[#86868B]">({audit.auditGrade})</span>
        </span>
      )}

      <div className="flex shrink-0 items-center gap-1.5">
        {confirming ? (
          <>
            <span className="text-[12px] text-[#86868B]">Revoke the link too?</span>
            <Button variant="danger" size="sm" loading={busy} onClick={handleDelete}>
              Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            {isDone && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={copied ? Check : Copy}
                  onClick={copyShareLink}
                  title="Copy the share link"
                >
                  {copied ? "Copied" : "Link"}
                </Button>
                <Link
                  href={`/audits/${audit.id}`}
                  // Styled to match Button's `secondary`/`sm` rather than wrapping
                  // one: a <button> inside an <a> is invalid HTML, and browsers
                  // disagree about which of the two handles the click.
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#E5E5EA] bg-white px-3 text-[12px] font-medium text-[#4B5563] transition-colors hover:bg-[#F5F5F7] hover:text-[#1D1D1F]"
                >
                  Open
                  <ArrowUpRight size={14} className="shrink-0" strokeWidth={2} />
                </Link>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              icon={Trash2}
              onClick={() => setConfirming(true)}
              title="Delete this audit"
            />
          </>
        )}
      </div>
    </li>
  );
}
