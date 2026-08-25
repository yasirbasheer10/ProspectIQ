"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Check,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import type { StoredLookalikeProfile } from "@/lib/ai/lookalike";
import { SIZE_BUCKETS } from "../discovery/constants";
import { TagPill } from "../discovery/_components/Primitives";
import {
  startLookalike,
  saveProfileAsIcp,
  searchForLookalikes,
  type EditedProfile,
} from "./actions";
import { useLookalikeRunPolling } from "./useLookalikePolling";

/**
 * Lookalike Search: paste the customers you already have, get the profile they
 * share, then go find more of them.
 *
 * The screen is built around one idea — the agency has to be able to *disagree*
 * with the profile before acting on it. So the profile arrives editable, and
 * "Save as my ICP" and "Find companies like these" are two separate buttons,
 * because committing a profile and trying it out are two different decisions.
 *
 * Two things render read-only on purpose. Technologies and business models are
 * shown because they are evidence the profile is real, but they are not editable
 * because `runDiscoveryEngine` does not search on either — an editable field that
 * changes nothing is worse than no field. And the confidence badge reports which
 * dimensions actually agreed across the seeds, which matters because most freshly
 * read websites yield no employee count and no technology list at all.
 */

export interface LookalikeProfileView {
  runId: string;
  createdAt: Date;
  profile: StoredLookalikeProfile;
  /**
   * Which of the six discovery buckets best matches the computed employee band,
   * or null for "any size". Computed on the server by `sizeBucketFor`, because
   * that helper reaches into `lib/ai/lookalike.ts` — which imports Prisma and the
   * Groq client, neither of which belongs in a browser bundle.
   */
  initialSize: string | null;
}

/** What the size dropdown offers. `""` is the form's spelling of null. */
const SIZE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Any size" },
  ...SIZE_BUCKETS.map((b) => ({ value: b, label: `${b} employees` })),
];

const CONFIDENCE_VARIANT = {
  HIGH: "success",
  MEDIUM: "warning",
  LOW: "default",
} as const;

export function LookalikeClient({
  latest,
  usedThisMonth,
  monthlyLimit,
}: {
  latest: LookalikeProfileView | null;
  usedThisMonth: number;
  monthlyLimit: number;
}) {
  const router = useRouter();

  const [domains, setDomains] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [runIdToPoll, setRunIdToPoll] = useState<string | null>(null);

  /**
   * Which kind of run is in flight. Held in a ref as well as in state because
   * `handleSettled` has to stay referentially stable — putting `phase` in its
   * dependency list would resubscribe the poll and reset its clock mid-run.
   */
  const [phase, setPhase] = useState<"profile" | "search" | null>(null);
  const phaseRef = useRef<"profile" | "search" | null>(null);

  /** True while the agency has asked to start over with a fresh set of domains. */
  const [startingOver, setStartingOver] = useState(false);

  /**
   * `router.refresh()` is what fetches the finished profile, and it is not
   * instant. Running it inside a transition lets the overlay stay up until the
   * new props have actually arrived, instead of flashing the old screen.
   */
  const [isRefreshing, startRefresh] = useTransition();

  const beginPhase = (next: "profile" | "search") => {
    phaseRef.current = next;
    setPhase(next);
    setBusy(true);
    setErrorMsg(null);
  };

  const endPhase = () => {
    phaseRef.current = null;
    setPhase(null);
    setBusy(false);
  };

  const handleSettled = useCallback(
    (error: string | null) => {
      setRunIdToPoll(null);

      if (error) {
        endPhase();
        setErrorMsg(error);
        return;
      }

      if (phaseRef.current === "search") {
        // Same destination the discovery screen uses. The overlay deliberately
        // stays up through the navigation — the companies are already saved, and
        // a flash of this page in between reads as if nothing happened.
        router.push("/companies");
        return;
      }

      // The profile run wrote its result to the AgentRun row, so the server
      // component has to re-read it.
      setStartingOver(false);
      startRefresh(() => {
        router.refresh();
        endPhase();
      });
    },
    [router]
  );

  const { ticks } = useLookalikeRunPolling({
    runId: runIdToPoll,
    timeoutMessage:
      "This is taking much longer than it should. Nothing has been lost — reload the page and check before starting again.",
    onSettled: handleSettled,
  });

  const handleBuild = async () => {
    beginPhase("profile");
    try {
      const res = await startLookalike({ domains });
      if (res?.runId) {
        setRunIdToPoll(res.runId);
      } else {
        // With no run id there is nothing to poll, so the overlay would hang.
        endPhase();
        setErrorMsg("That did not start — no run was created. Please try again.");
      }
    } catch (e: unknown) {
      console.error(e);
      endPhase();
      setErrorMsg(
        e instanceof Error ? e.message : "Something went wrong. Please try again."
      );
    }
  };

  const handleSearch = async (edited: EditedProfile) => {
    beginPhase("search");
    try {
      const res = await searchForLookalikes(edited);
      if (res?.runId) {
        setRunIdToPoll(res.runId);
      } else {
        endPhase();
        setErrorMsg("The search did not start — no run was created. Please try again.");
      }
    } catch (e: unknown) {
      console.error(e);
      endPhase();
      setErrorMsg(
        e instanceof Error ? e.message : "Something went wrong starting the search."
      );
    }
  };

  const handleSave = async (edited: EditedProfile) => {
    setErrorMsg(null);
    try {
      await saveProfileAsIcp(edited);
      return true;
    } catch (e: unknown) {
      console.error(e);
      setErrorMsg(
        e instanceof Error ? e.message : "Could not save that as your ICP. Please try again."
      );
      return false;
    }
  };

  const atLimit = usedThisMonth >= monthlyLimit;
  const showForm = latest === null || startingOver;
  const working = busy || isRefreshing;

  return (
    <div className="flex h-full flex-col bg-white">
      <Topbar
        title="Lookalike Search"
        subtitle={`${usedThisMonth} of ${monthlyLimit} used this month`}
      />

      <main className="relative flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-3xl">
          {errorMsg && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-[#FF3B30]/20 bg-[#FF3B30]/10 p-4 text-[#FF3B30]">
              <X className="mt-0.5 shrink-0" size={18} />
              <p className="text-[14px] font-medium leading-tight">{errorMsg}</p>
            </div>
          )}

          {showForm ? (
            <SeedForm
              domains={domains}
              onChange={setDomains}
              onSubmit={handleBuild}
              disabled={working || atLimit}
              atLimit={atLimit}
              monthlyLimit={monthlyLimit}
              canCancel={latest !== null}
              onCancel={() => {
                setStartingOver(false);
                setErrorMsg(null);
              }}
            />
          ) : (
            <ProfileEditor
              // Remounts when a new run finishes, so the fields re-initialise
              // from the new profile instead of keeping the old edits.
              key={latest.runId}
              view={latest}
              busy={working}
              onSave={handleSave}
              onSearch={handleSearch}
              onStartOver={() => {
                setDomains("");
                setErrorMsg(null);
                setStartingOver(true);
              }}
            />
          )}
        </div>

        {/* ── Working overlay ───────────────────────────────────────────────
            Covers the page rather than sitting inline: reading five websites
            takes a minute or two, and a second run started mid-flight would
            produce a second profile this screen can only show one of. */}
        {working && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-xl border border-[#E5E5EA] bg-white p-6 text-center shadow-apple-lg">
              <Loader2 className="mx-auto animate-spin text-[#0071E3]" size={28} />
              <p className="mt-4 text-[15px] font-semibold text-[#1D1D1F]">
                {phase === "search" ? "Finding similar companies" : "Reading your customers"}
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[#86868B]">
                {phase === "search"
                  ? "This usually takes a few minutes. We’ll take you to the companies when it’s ready."
                  : "We’re reading each website and working out what they have in common. This usually takes a minute or two."}
              </p>
              <div className="mt-5 flex items-center justify-center gap-1.5">
                {[1, 2, 3, 4].map((s) => (
                  <span
                    key={s}
                    className={cn(
                      "h-1 w-8 rounded-full transition-colors duration-300",
                      // Nothing reports real progress for these runs, so the bars
                      // track elapsed polls and stop at full rather than pretending
                      // to know which stage the engine is on.
                      ticks >= s * 4 ? "bg-[#0071E3]" : "bg-[#E5E5EA]"
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

// ─────────────────────────────────────────────────────────────
// THE INPUT
// ─────────────────────────────────────────────────────────────

function SeedForm({
  domains,
  onChange,
  onSubmit,
  disabled,
  atLimit,
  monthlyLimit,
  canCancel,
  onCancel,
}: {
  domains: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  atLimit: boolean;
  monthlyLimit: number;
  canCancel: boolean;
  onCancel: () => void;
}) {
  // Counted here only to keep the button honest before the server rejects it.
  // `startLookalike` re-derives this list and owns the real validation.
  const count = domains
    .split(/[\n,]/)
    .map((d) => d.trim())
    .filter(Boolean).length;

  const tooFew = count < 2;

  return (
    <div className="rounded-xl border border-[#E5E5EA] bg-white p-6 shadow-apple-sm">
      <h2 className="text-[15px] font-semibold text-[#1D1D1F]">
        Find more customers like your best ones
      </h2>
      <p className="mt-1 text-[13px] leading-relaxed text-[#86868B]">
        Paste the websites of two to five customers you would happily take ten more
        of. We read each one, work out what they have in common, and show you the
        profile before you search on it.
      </p>

      <textarea
        value={domains}
        onChange={(e) => onChange(e.target.value)}
        placeholder={"acme.com\nnorthwind.co.uk\nbrightpath.io"}
        rows={5}
        spellCheck={false}
        autoCapitalize="off"
        disabled={disabled}
        className={cn(
          "mt-4 w-full resize-y rounded-lg border border-[#E5E5EA] px-4 py-3 text-[14px] leading-relaxed text-[#1D1D1F]",
          "placeholder:text-[#86868B] focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20",
          "disabled:cursor-not-allowed disabled:bg-[#F5F5F7]"
        )}
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-[#86868B]">
          One address per line.{" "}
          {count === 0
            ? "Two at the minimum — a single company has no pattern to find."
            : `${count} ${count === 1 ? "address" : "addresses"} so far.`}
        </p>

        <div className="flex items-center gap-2">
          {canCancel && (
            <Button variant="ghost" size="md" onClick={onCancel} disabled={disabled}>
              Cancel
            </Button>
          )}
          <Button
            variant="primary"
            size="lg"
            icon={Sparkles}
            loading={disabled && !atLimit}
            disabled={disabled || tooFew}
            onClick={onSubmit}
          >
            Build profile
          </Button>
        </div>
      </div>

      {atLimit && (
        <p className="mt-3 text-[12px] text-[#FF9500]">
          You have used all {monthlyLimit} lookalike searches for this month. The limit
          resets on the 1st.
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// THE PROFILE
// ─────────────────────────────────────────────────────────────

function ProfileEditor({
  view,
  busy,
  onSave,
  onSearch,
  onStartOver,
}: {
  view: LookalikeProfileView;
  busy: boolean;
  onSave: (edited: EditedProfile) => Promise<boolean>;
  onSearch: (edited: EditedProfile) => Promise<void>;
  onStartOver: () => void;
}) {
  const p = view.profile;

  const [name, setName] = useState(p.name);
  const [industries, setIndustries] = useState<string[]>(p.industries);
  const [geographies, setGeographies] = useState<string[]>(p.geographies);
  const [keywords, setKeywords] = useState<string[]>(p.keywords);
  const [size, setSize] = useState(view.initialSize ?? "");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const edited = (): EditedProfile => ({
    name: name.trim(),
    industries,
    geographies,
    keywords,
    // Passed through untouched. Not editable here because the discovery engine
    // ignores both, but still saved, because the ICP row and the Settings screen
    // do show them.
    technologies: p.technologies,
    businessModels: p.businessModels,
    size: size === "" ? null : size,
  });

  const handleSave = async () => {
    setSaving(true);
    const ok = await onSave(edited());
    setSaving(false);
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2400);
    }
  };

  const usedSeeds = p.seeds.filter((s) => s.companyId !== null);
  const skippedSeeds = p.seeds.filter((s) => s.companyId === null);

  return (
    <div className="space-y-6">
      {/* ── What we found ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-[#E5E5EA] bg-white p-6 shadow-apple-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <label
              htmlFor="lookalike-name"
              className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#86868B]"
            >
              Profile name
            </label>
            <input
              id="lookalike-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              className={cn(
                "mt-1.5 w-full rounded-lg border border-transparent bg-[#F5F5F7] px-4 py-2.5 text-[15px] font-medium text-[#1D1D1F]",
                "focus:border-[#0071E3] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0071E3]",
                "disabled:cursor-not-allowed"
              )}
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon={RotateCcw}
            onClick={onStartOver}
            disabled={busy}
            title="Build a profile from different customers"
          >
            Start over
          </Button>
        </div>

        <p className="mt-4 text-[14px] leading-relaxed text-[#4B5563]">{p.description}</p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge variant={CONFIDENCE_VARIANT[p.confidence]} dot>
            {p.confidence === "HIGH"
              ? "Strong pattern"
              : p.confidence === "MEDIUM"
                ? "Some pattern"
                : "Weak pattern"}
          </Badge>
          <span className="text-[12px] text-[#86868B]">{p.confidenceReason}</span>
        </div>

        {p.sharedTraits.length > 0 && (
          <ul className="mt-4 space-y-1.5 border-t border-[#E5E5EA] pt-4">
            {p.sharedTraits.map((t, i) => (
              <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-[#4B5563]">
                <Check size={15} className="mt-0.5 shrink-0 text-[#34C759]" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 border-t border-[#E5E5EA] pt-4 text-[12px] text-[#86868B]">
          <p>
            Built from{" "}
            <span className="text-[#4B5563]">
              {usedSeeds.map((s) => s.name || s.domain).join(", ")}
            </span>
            .
          </p>
          {skippedSeeds.length > 0 && (
            <p className="mt-1 text-[#FF9500]">
              Skipped{" "}
              {skippedSeeds
                .map((s) => `${s.domain} (${s.skippedReason || "could not be read"})`)
                .join(", ")}
              .
            </p>
          )}
        </div>
      </div>

      {/* ── What gets searched ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-[#E5E5EA] bg-white p-6 shadow-apple-sm">
        <h3 className="text-[15px] font-semibold text-[#1D1D1F]">What we&rsquo;ll search for</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-[#86868B]">
          Change anything that looks wrong. These four things are what the search
          actually uses.
        </p>

        <div className="mt-5 space-y-5">
          <ChipField
            label="Industries"
            hint="At least one. Taken from what your customers' own websites say they do."
            values={industries}
            onChange={setIndustries}
            placeholder="Add an industry"
            disabled={busy}
          />

          <ChipField
            label="Countries"
            hint="At least one. Without a country the search covers the whole world and returns noise."
            values={geographies}
            onChange={setGeographies}
            placeholder="Add a country"
            disabled={busy}
          />

          <div>
            <label
              htmlFor="lookalike-size"
              className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#86868B]"
            >
              Company size
            </label>
            <p className="mt-1 text-[12px] leading-relaxed text-[#86868B]">
              The headcount range these customers actually fall in, matched to the
              closest search range. Widen it if you sell higher or lower than this.
            </p>
            <select
              id="lookalike-size"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              disabled={busy}
              className={cn(
                "mt-2 w-full rounded-lg border border-transparent bg-[#F5F5F7] px-4 py-2.5 text-[14px] text-[#1D1D1F]",
                "focus:border-[#0071E3] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0071E3]",
                "disabled:cursor-not-allowed"
              )}
            >
              {SIZE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <ChipField
            label="Search phrases"
            hint="Each phrase becomes a live web search, so short and specific beats long and clever."
            values={keywords}
            onChange={setKeywords}
            placeholder="Add a phrase"
            disabled={busy}
          />
        </div>
      </div>

      {/* ── Observed but not searched on ─────────────────────────────────
          Shown because it is the evidence that the profile came from real
          websites, and left read-only because `runDiscoveryEngine` accepts
          neither as a filter. */}
      {(p.technologies.length > 0 || p.businessModels.length > 0) && (
        <div className="rounded-xl border border-[#E5E5EA] bg-[#F5F5F7]/60 p-6">
          <h3 className="text-[13px] font-semibold text-[#1D1D1F]">
            Also true of these customers
          </h3>
          <p className="mt-1 text-[12px] leading-relaxed text-[#86868B]">
            Saved with the profile, but not used as a search filter.
          </p>

          {p.businessModels.length > 0 && (
            <ReadOnlyRow icon={Building2} label="Business model" values={p.businessModels} />
          )}
          {p.technologies.length > 0 && (
            <ReadOnlyRow icon={Users} label="Technology" values={p.technologies} />
          )}
        </div>
      )}

      {/* ── The two decisions ───────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="secondary"
          size="lg"
          icon={saved ? Check : Save}
          loading={saving}
          disabled={busy || saving || name.trim().length === 0}
          onClick={handleSave}
        >
          {saved ? "Saved to Settings" : "Save as my ICP"}
        </Button>
        <Button
          variant="primary"
          size="lg"
          icon={Search}
          disabled={busy || industries.length === 0 || geographies.length === 0}
          onClick={() => void onSearch(edited())}
        >
          Find companies like these
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SMALL PIECES
// ─────────────────────────────────────────────────────────────

/**
 * A labelled list of removable pills with an input to add more.
 *
 * Reuses `TagPill` from the discovery form rather than restyling one here. It
 * lives under `discovery/_components`, and the underscore does mean "private to
 * that route" — but that file exists specifically because the same pill had been
 * copy-pasted three times and the copies drifted, so adding a fourth would
 * recreate the exact problem it was written to solve.
 */
function ChipField({
  label,
  hint,
  values,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  hint: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const value = draft.trim();
    if (!value) return;
    // Case-insensitive, because "SaaS" and "saas" would become two search angles
    // for one industry and halve the useful breadth of the run.
    if (!values.some((v) => v.toLowerCase() === value.toLowerCase())) {
      onChange([...values, value]);
    }
    setDraft("");
  };

  return (
    <div>
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#86868B]">
        {label}
      </span>
      <p className="mt-1 text-[12px] leading-relaxed text-[#86868B]">{hint}</p>

      <div className="mt-2 flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              // Otherwise Enter submits whichever form this ends up inside.
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "flex-1 rounded-lg border border-transparent bg-[#F5F5F7] px-4 py-2.5 text-[14px] text-[#1D1D1F] transition-all",
            "placeholder:text-[#86868B] focus:border-[#0071E3] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0071E3]",
            "disabled:cursor-not-allowed"
          )}
        />
        <Button
          variant="secondary"
          size="md"
          icon={Plus}
          onClick={add}
          disabled={disabled || draft.trim().length === 0}
          aria-label={`Add to ${label}`}
        />
      </div>

      {values.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {values.map((v) => (
            <TagPill
              key={v}
              label={v}
              tone="blue"
              onRemove={disabled ? undefined : () => onChange(values.filter((x) => x !== v))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReadOnlyRow({
  icon: Icon,
  label,
  values,
}: {
  icon: React.ElementType;
  label: string;
  values: string[];
}) {
  return (
    <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="flex items-center gap-1.5 text-[12px] font-medium text-[#4B5563]">
        <Icon size={13} className="shrink-0 text-[#86868B]" />
        {label}
      </span>
      <span className="text-[13px] text-[#4B5563]">{values.join(" · ")}</span>
    </div>
  );
}
