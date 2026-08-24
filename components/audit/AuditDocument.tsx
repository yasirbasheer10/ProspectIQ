import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { AUDIT_AREA_LABELS } from "@/lib/scoring/audit-score";
import { safeBrandColor, safeLogoUrl, type AuditBrand, type StoredAuditContent } from "@/lib/ai/audit";

/**
 * The audit document itself.
 *
 * Rendered in two places from one file on purpose: `/audits/[id]` (the agency
 * reviewing it before they send) and `/a/[shareToken]` (the prospect reading it).
 * If those diverged, the agency would be approving something subtly different
 * from what gets sent — the single worst bug this feature could have. So the only
 * permitted difference is the `chrome` prop, which adds the agency-only
 * confidence note and hides nothing from the prospect that the agency saw.
 *
 * A server component with no interactivity, so it costs no client JS on the
 * public page and prints from the browser's own Print command. `print:`
 * utilities strip the shadows and page furniture; nothing else is needed.
 *
 * Everything visual comes from the *frozen* `brandSnapshot`, never from the live
 * workspace, so an audit sent last month keeps the logo it was sent with.
 */

export function AuditDocument({
  content,
  brand,
  headline,
  summary,
  companyName,
  companyDomain,
  generatedAt,
  chrome = "public",
}: {
  content: StoredAuditContent;
  brand: AuditBrand;
  /** Own columns on `GrowthAudit`, not part of `sections`, so the list page can
   *  show them without parsing Json. Passed in rather than read off `content`. */
  headline: string | null;
  summary: string | null;
  companyName: string;
  companyDomain: string | null;
  generatedAt: Date;
  /** "internal" adds the agency-only confidence note above the document. */
  chrome?: "internal" | "public";
}) {
  const accent = safeBrandColor(brand.brandColor);
  const logoUrl = safeLogoUrl(brand.logoUrl);
  const agency = brand.name?.trim() || null;
  const { score } = content;

  return (
    <article className="mx-auto max-w-3xl">
      {/* Agency-only. Deliberately outside the document's own border so it reads
          as a note *about* the audit, and so print:hidden removes it cleanly if
          the agency prints from this page rather than the share link. */}
      {chrome === "internal" && (
        <div className="mb-4 rounded-lg border border-[#E5E5EA] bg-white px-4 py-3 print:hidden">
          <p className="text-[12px] font-medium text-[#1D1D1F]">
            {score.confidence === "HIGH"
              ? "Ready to send"
              : score.confidence === "MEDIUM"
                ? "Worth a read before sending"
                : "Thin evidence — read this before sending"}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-[#86868B]">{score.confidenceReason}</p>
          {content.unmatchedFindingCount > 0 && (
            <p className="mt-1.5 text-[12px] leading-relaxed text-[#FF9500]">
              {content.unmatchedFindingCount === 1
                ? "1 recommendation does not map to a service you listed."
                : `${content.unmatchedFindingCount} recommendations do not map to a service you listed.`}{" "}
              Add the services you actually sell in Settings and future audits will
              only recommend work you can deliver.
            </p>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-[#E5E5EA] bg-white shadow-apple-sm print:rounded-none print:border-0 print:shadow-none">
        {/* ── Letterhead ───────────────────────────────────────────────────── */}
        <header className="border-b border-[#E5E5EA] px-8 py-6 sm:px-10">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt={agency ?? "Logo"}
                  className="mb-3 h-8 w-auto max-w-[180px] object-contain object-left"
                />
              ) : (
                agency && (
                  <p className="mb-3 text-[15px] font-semibold tracking-tight text-[#1D1D1F]">
                    {agency}
                  </p>
                )
              )}
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#86868B]">
                Growth Audit
              </p>
              <h1 className="mt-1 truncate text-[22px] font-semibold tracking-tight text-[#1D1D1F]">
                {companyName}
              </h1>
              {companyDomain && (
                <p className="mt-0.5 text-[13px] text-[#86868B]">{companyDomain}</p>
              )}
            </div>

            {score.showScore && <ScoreDial score={score} accent={accent} />}
          </div>
        </header>

        {/* ── Opening ──────────────────────────────────────────────────────── */}
        <section className="px-8 py-8 sm:px-10">
          <h2 className="text-[19px] font-semibold leading-snug tracking-tight text-[#1D1D1F]">
            {headline?.trim() || "What we found"}
          </h2>
          {summary?.trim() && (
            <p className="mt-3 whitespace-pre-line text-[14px] leading-relaxed text-[#4B5563]">
              {summary}
            </p>
          )}
        </section>

        {/* ── Area breakdown ───────────────────────────────────────────────── */}
        {score.showScore && score.areas.some((a) => a.assessed) && (
          <section className="border-t border-[#E5E5EA] px-8 py-7 sm:px-10">
            <SectionLabel>By area</SectionLabel>
            <div className="mt-4 space-y-3">
              {score.areas
                .filter((a) => a.assessed)
                .map((a) => (
                  <div key={a.area} className="flex items-center gap-4">
                    <span className="w-[150px] shrink-0 text-[13px] text-[#4B5563]">
                      {AUDIT_AREA_LABELS[a.area]}
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F5F5F7]">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${a.score ?? 0}%`, backgroundColor: accent }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right text-[13px] font-medium tabular-nums text-[#1D1D1F]">
                      {Math.round(a.score ?? 0)}
                    </span>
                  </div>
                ))}
            </div>
          </section>
        )}

        {/* ── Strengths ────────────────────────────────────────────────────── */}
        {/* Before the findings, always. An audit that opens with six problems is a
            document the prospect stops reading; naming what already works is what
            makes the rest land as help rather than a teardown. */}
        {content.strengths.length > 0 && (
          <section className="border-t border-[#E5E5EA] px-8 py-7 sm:px-10">
            <SectionLabel>What is working</SectionLabel>
            <ul className="mt-4 space-y-2.5">
              {content.strengths.map((s, i) => (
                <li key={i} className="flex gap-3 text-[14px] leading-relaxed text-[#4B5563]">
                  <span
                    className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: accent }}
                  />
                  {s}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Findings ─────────────────────────────────────────────────────── */}
        {content.findings.length > 0 && (
          <section className="border-t border-[#E5E5EA] px-8 py-7 sm:px-10">
            <SectionLabel>What we would change</SectionLabel>
            <div className="mt-5 space-y-8">
              {content.findings.map((f, i) => (
                <Finding key={i} finding={f} index={i + 1} accent={accent} />
              ))}
            </div>
          </section>
        )}

        {/* ── The ask ──────────────────────────────────────────────────────── */}
        {content.nextStep && (
          <section
            className="border-t border-[#E5E5EA] px-8 py-7 sm:px-10"
            style={{ backgroundColor: `${accent}0A` }}
          >
            <SectionLabel>Where we would start</SectionLabel>
            <p className="mt-3 whitespace-pre-line text-[14px] leading-relaxed text-[#1D1D1F]">
              {content.nextStep}
            </p>
          </section>
        )}

        {/* ── Signature ────────────────────────────────────────────────────── */}
        <footer className="border-t border-[#E5E5EA] px-8 py-6 text-[12px] leading-relaxed text-[#86868B] sm:px-10">
          {brand.senderName && (
            <p className="text-[13px] font-medium text-[#1D1D1F]">
              {brand.senderName}
              {brand.senderTitle && (
                <span className="font-normal text-[#86868B]">, {brand.senderTitle}</span>
              )}
            </p>
          )}
          <p className="mt-1">
            {agency ? `Prepared by ${agency}` : "Prepared"} for {companyName} ·{" "}
            {generatedAt.toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
          {(brand.senderEmail || brand.websiteUrl) && (
            <p className="mt-1.5 flex flex-wrap gap-x-3">
              {brand.senderEmail && (
                <a href={`mailto:${brand.senderEmail}`} className="hover:text-[#1D1D1F]">
                  {brand.senderEmail}
                </a>
              )}
              {brand.websiteUrl && (
                <a
                  href={withScheme(brand.websiteUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#1D1D1F]"
                >
                  {brand.websiteUrl.replace(/^https?:\/\//, "")}
                </a>
              )}
            </p>
          )}
        </footer>
      </div>
    </article>
  );
}

// ─── Pieces ────────────────────────────────────────────────────

const SEVERITY_LABELS = {
  HIGH: "Costing you now",
  MEDIUM: "Worth fixing",
  LOW: "Minor",
} as const;

const SEVERITY_STYLES = {
  HIGH: "bg-[#FF3B30]/10 text-[#FF3B30] border-[#FF3B30]/20",
  MEDIUM: "bg-[#FF9500]/10 text-[#FF9500] border-[#FF9500]/20",
  LOW: "bg-[#F5F5F7] text-[#4B5563] border-[#E5E5EA]",
} as const;

const EFFORT_LABELS = {
  QUICK_WIN: "Quick win",
  PROJECT: "Project",
  ONGOING: "Ongoing",
} as const;

function Finding({
  finding,
  index,
  accent,
}: {
  finding: StoredAuditContent["findings"][number];
  index: number;
  accent: string;
}) {
  return (
    <div className="break-inside-avoid">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
          style={{ backgroundColor: accent }}
        >
          {index}
        </span>
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
            SEVERITY_STYLES[finding.severity]
          )}
        >
          {SEVERITY_LABELS[finding.severity]}
        </span>
        <span className="inline-flex items-center rounded-full border border-[#E5E5EA] bg-transparent px-2 py-0.5 text-[11px] font-medium text-[#4B5563]">
          {EFFORT_LABELS[finding.effort]}
        </span>
        <span className="text-[11px] text-[#86868B]">{AUDIT_AREA_LABELS[finding.area]}</span>
      </div>

      <h3 className="mt-2.5 text-[15px] font-semibold leading-snug text-[#1D1D1F]">
        {finding.title}
      </h3>

      <p className="mt-2 text-[14px] leading-relaxed text-[#4B5563]">{finding.observation}</p>

      {finding.impact && (
        <p className="mt-2 text-[14px] leading-relaxed text-[#4B5563]">
          <span className="font-medium text-[#1D1D1F]">Why it matters. </span>
          {finding.impact}
        </p>
      )}

      <div className="mt-3 rounded-lg border-l-2 bg-[#F5F5F7] px-4 py-3" style={{ borderColor: accent }}>
        <p className="text-[14px] leading-relaxed text-[#1D1D1F]">
          <span className="font-medium">What we would do. </span>
          {finding.recommendation}
        </p>
      </div>

      {/* The citations are the whole reason this document is credible: they are
          what separates "your messaging is unclear" from a quote off their own
          page. Shown, never hidden behind a toggle. */}
      {finding.citations.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-[#E5E5EA] pt-3">
          {finding.citations.map((c, i) => (
            <li key={i} className="text-[12px] leading-relaxed text-[#86868B]">
              {c.quote && <span className="italic text-[#4B5563]">&ldquo;{c.quote}&rdquo;</span>}
              {c.quote && " — "}
              {c.sourceUrl ? (
                <a
                  href={c.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline decoration-[#E5E5EA] underline-offset-2 hover:text-[#1D1D1F]"
                >
                  {c.sourceName || c.title}
                  <ExternalLink size={10} className="shrink-0 print:hidden" />
                </a>
              ) : (
                <span>{c.sourceName || c.title}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ScoreDial({
  score,
  accent,
}: {
  score: StoredAuditContent["score"];
  accent: string;
}) {
  return (
    <div className="shrink-0 text-center">
      <div
        className="flex h-20 w-20 flex-col items-center justify-center rounded-full border-[3px]"
        style={{ borderColor: accent }}
      >
        <span className="text-[26px] font-semibold leading-none tracking-tight text-[#1D1D1F] tabular-nums">
          {Math.round(score.overall)}
        </span>
        <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-[#86868B]">
          Grade {score.grade}
        </span>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#86868B]">
      {children}
    </h2>
  );
}

// ─── Helpers ───────────────────────────────────────────────────

function withScheme(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
