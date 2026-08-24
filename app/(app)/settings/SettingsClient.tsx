"use client";

import { useState } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ChipInput } from "@/components/ui/ChipInput";
import { updateWorkspaceSettings, updateAuditBranding } from "./actions";

export interface AuditBrandingValues {
  logoUrl: string;
  brandColor: string;
  senderName: string;
  senderTitle: string;
  senderEmail: string;
  websiteUrl: string;
}

interface SettingsClientProps {
  initialDemoMode: boolean;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  icp: Record<string, any> | null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  offer: Record<string, any> | null;
  branding: AuditBrandingValues;
}

export function SettingsClient({ initialDemoMode, icp, offer, branding }: SettingsClientProps) {
  const [demoMode] = useState(initialDemoMode);
  const [autoApprove, setAutoApprove] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // ICP State
  const [icpData, setIcpData] = useState({
    geographies: icp?.geographies || [],
    regions: icp?.regions || [],
    industries: icp?.industries || [],
    businessModel: icp?.businessModel || [],
    technologies: icp?.technologies || [],
    buyerRoles: icp?.buyerRoles || [],
    excludedIndustries: icp?.excludedIndustries || [],
    buyingSignals: icp?.buyingSignals || [],
  });

  // Offer State
  const [offerData, setOfferData] = useState({
    name: offer?.name || "",
    description: offer?.description || "",
    services: offer?.services || [],
    targetProblems: offer?.targetProblems || [],
    buyerRoles: offer?.buyerRoles || [],
    relevantIndustries: offer?.relevantIndustries || [],
  });

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateWorkspaceSettings({
        demoMode,
        icp: icpData,
        offer: offerData,
      });
      // Could add a toast notification here
    } catch (e) {
      console.error(e);
    }
    setIsSaving(false);
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <Topbar title="Settings" />
      <main className="flex-1 overflow-y-auto p-8 bg-[#F5F5F7]">
        <div className="mx-auto max-w-4xl space-y-8">
          
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-[#1D1D1F]">Workspace Configuration</h2>
            <Button variant="primary" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </div>

          <div>
            <h3 className="text-xl font-medium text-[#1D1D1F] mb-4">Ideal Customer Profile (ICP)</h3>
            <Card className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ChipInput
                  label="Countries / Geographies"
                  value={icpData.geographies}
                  onChange={(val) => setIcpData({ ...icpData, geographies: val })}
                  placeholder="e.g. United States, Canada"
                />
                <ChipInput
                  label="Regions"
                  value={icpData.regions}
                  onChange={(val) => setIcpData({ ...icpData, regions: val })}
                  placeholder="e.g. North America, EMEA"
                />
                <ChipInput
                  label="Industries"
                  value={icpData.industries}
                  onChange={(val) => setIcpData({ ...icpData, industries: val })}
                  placeholder="e.g. SaaS, Technology"
                />
                <ChipInput
                  label="Excluded Industries"
                  value={icpData.excludedIndustries}
                  onChange={(val) => setIcpData({ ...icpData, excludedIndustries: val })}
                  placeholder="e.g. B2C, Non-profit"
                />
                <ChipInput
                  label="Business Model"
                  value={icpData.businessModel}
                  onChange={(val) => setIcpData({ ...icpData, businessModel: val })}
                  placeholder="e.g. B2B, Subscription"
                />
                <ChipInput
                  label="Technologies Used"
                  value={icpData.technologies}
                  onChange={(val) => setIcpData({ ...icpData, technologies: val })}
                  placeholder="e.g. Salesforce, AWS"
                />
                <div className="md:col-span-2">
                  <ChipInput
                    label="Buying Signals"
                    value={icpData.buyingSignals}
                    onChange={(val) => setIcpData({ ...icpData, buyingSignals: val })}
                    placeholder="e.g. hiring sales, series b"
                  />
                </div>
                <div className="md:col-span-2">
                  <ChipInput
                    label="Target Buyer Roles"
                    value={icpData.buyerRoles}
                    onChange={(val) => setIcpData({ ...icpData, buyerRoles: val })}
                    placeholder="e.g. VP of Sales, CRO"
                  />
                </div>
              </div>
            </Card>
          </div>

          <div>
            <h3 className="text-xl font-medium text-[#1D1D1F] mb-4">Offer Configuration</h3>
            <Card className="p-6 space-y-6">
              <div>
                <label className="block text-[13px] font-medium text-[#4B5563] mb-1.5">Offer Name</label>
                <input
                  type="text"
                  value={offerData.name}
                  onChange={(e) => setOfferData({ ...offerData, name: e.target.value })}
                  className="w-full rounded-lg border border-[#E5E5EA] px-3 py-2 text-[14px] focus:border-[#0071E3] focus:outline-none focus:ring-1 focus:ring-[#0071E3] transition-all"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-[#4B5563] mb-1.5">Offer Description / Elevator Pitch</label>
                <textarea
                  value={offerData.description}
                  onChange={(e) => setOfferData({ ...offerData, description: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-[#E5E5EA] px-3 py-2 text-[14px] focus:border-[#0071E3] focus:outline-none focus:ring-1 focus:ring-[#0071E3] transition-all resize-none"
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ChipInput
                  label="Services Offered"
                  value={offerData.services}
                  onChange={(val) => setOfferData({ ...offerData, services: val })}
                  placeholder="e.g. AI Implementation, Coaching"
                />
                <ChipInput
                  label="Target Buyer Roles"
                  value={offerData.buyerRoles}
                  onChange={(val) => setOfferData({ ...offerData, buyerRoles: val })}
                  placeholder="e.g. VP of Sales"
                />
                <div className="md:col-span-2">
                  <ChipInput
                    label="Target Problems (Pain Points)"
                    value={offerData.targetProblems}
                    onChange={(val) => setOfferData({ ...offerData, targetProblems: val })}
                    placeholder="e.g. Low outbound reply rates"
                  />
                </div>
                <div className="md:col-span-2">
                  <ChipInput
                    label="Relevant Industries"
                    value={offerData.relevantIndustries}
                    onChange={(val) => setOfferData({ ...offerData, relevantIndustries: val })}
                    placeholder="e.g. Software, Healthcare"
                  />
                </div>
              </div>
            </Card>
          </div>

          <BrandingSection initial={branding} />

          <div>
            <h3 className="text-xl font-medium text-[#1D1D1F] mb-4">Agent Configuration</h3>
            <Card className="p-6 space-y-4">
              <div className="flex items-center justify-between cursor-pointer" onClick={() => setAutoApprove(!autoApprove)}>
                <div>
                  <h4 className="text-[14px] font-medium text-[#1D1D1F]">Auto-Approve Outreach</h4>
                  <p className="text-[13px] text-[#86868B]">Send emails without manual review.</p>
                </div>
                <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoApprove ? 'bg-[#34C759]' : 'bg-[#E5E5EA]'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${autoApprove ? 'translate-x-6' : 'translate-x-1'}`} />
                </div>
              </div>
            </Card>
          </div>

          <div>
            <h3 className="text-xl font-medium text-[#1D1D1F] mb-4">Demonstration Controls</h3>
            <Card className="p-6">
              <div className="space-y-4">
                <div className="flex flex-col gap-1">
                  <h4 className="text-[14px] font-medium text-[#1D1D1F]">Load Full Demo Pipeline</h4>
                  <p className="text-[13px] text-[#86868B]">Seeds the database with a complete pipeline journey (discovery, scoring, outreach, and simulated replies). Useful for live product presentations.</p>
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="primary"
                    onClick={async () => {
                      setIsSaving(true);
                      const res = await fetch("/api/demo/seed", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: "{}",
                      });
                      if (!res.ok) {
                        setIsSaving(false);
                        alert(`Could not load demo data: ${(await res.json().catch(() => ({}))).error ?? res.statusText}`);
                        return;
                      }
                      window.location.reload();
                    }}
                    disabled={isSaving}
                  >
                    LOAD DEMO
                  </Button>
                  <Button
                    className="bg-[#FF3B30] text-white hover:bg-[#D70015]"
                    onClick={async () => {
                      if (!confirm("Are you sure you want to completely wipe all demo data?")) return;
                      setIsSaving(true);
                      // The route requires this exact string in the body — it
                      // refuses requests that can't have been made deliberately.
                      const res = await fetch("/api/demo/reset", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ confirm: "RESET MY WORKSPACE" }),
                      });
                      if (!res.ok) {
                        setIsSaving(false);
                        alert(`Could not reset demo data: ${(await res.json().catch(() => ({}))).error ?? res.statusText}`);
                        return;
                      }
                      window.location.reload();
                    }}
                    disabled={isSaving}
                  >
                    RESET DEMO
                  </Button>
                </div>
              </div>
            </Card>
          </div>

        </div>
      </main>
    </div>
  );
}

// ─── Audit branding ────────────────────────────────────────────

/**
 * The letterhead that goes on every growth audit.
 *
 * Its own state and its own save button, separate from the ICP/offer form above.
 * The two have no fields in common and no reason to fail together, and an agency
 * that just wants its logo on a document should not have to satisfy the discovery
 * form first.
 */
function BrandingSection({ initial }: { initial: AuditBrandingValues }) {
  const [values, setValues] = useState(initial);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const set = (key: keyof AuditBrandingValues) => (v: string) =>
    setValues((prev) => ({ ...prev, [key]: v }));

  const handleSave = async () => {
    setIsSaving(true);
    setStatus(null);
    try {
      await updateAuditBranding(values);
      setStatus({ ok: true, message: "Saved." });
    } catch (e) {
      console.error(e);
      // The action's zod messages are written for a person ("Use a hex colour
      // like #0071E3"), so showing them beats a generic failure.
      setStatus({
        ok: false,
        message: e instanceof Error ? firstReadableIssue(e.message) : "Could not save.",
      });
    }
    setIsSaving(false);
  };

  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h3 className="text-xl font-medium text-[#1D1D1F]">Audit Branding</h3>
          <p className="mt-1 text-[13px] text-[#86868B]">
            Growth audits go out under your name, not ours. This is what your
            prospect sees at the top and bottom of the document.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {status && (
            <span
              className={`text-[13px] ${status.ok ? "text-[#34C759]" : "text-[#FF3B30]"}`}
            >
              {status.message}
            </span>
          )}
          <Button variant="primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Branding"}
          </Button>
        </div>
      </div>

      <Card className="p-6 space-y-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <TextField
            label="Logo URL"
            value={values.logoUrl}
            onChange={set("logoUrl")}
            placeholder="https://youragency.com/logo.png"
            hint="A direct link to an image. Left blank, we use your workspace name instead."
          />
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-[#4B5563]">
              Brand Colour
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(values.brandColor) ? values.brandColor : "#0071E3"}
                onChange={(e) => set("brandColor")(e.target.value.toUpperCase())}
                className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-[#E5E5EA] bg-white p-1"
                aria-label="Pick a brand colour"
              />
              <input
                type="text"
                value={values.brandColor}
                onChange={(e) => set("brandColor")(e.target.value)}
                placeholder="#0071E3"
                spellCheck={false}
                className="w-full rounded-lg border border-[#E5E5EA] px-3 py-2 font-mono text-[14px] transition-all focus:border-[#0071E3] focus:outline-none focus:ring-1 focus:ring-[#0071E3]"
              />
            </div>
            <p className="mt-1.5 text-[12px] text-[#86868B]">
              Used for headings, the score ring and the accent bars. Defaults to blue.
            </p>
          </div>
          <TextField
            label="Signed By"
            value={values.senderName}
            onChange={set("senderName")}
            placeholder="Jordan Vance"
            hint="The person the audit is from."
          />
          <TextField
            label="Title"
            value={values.senderTitle}
            onChange={set("senderTitle")}
            placeholder="Head of Growth"
          />
          <TextField
            label="Reply-To Email"
            value={values.senderEmail}
            onChange={set("senderEmail")}
            placeholder="jordan@youragency.com"
          />
          <TextField
            label="Your Website"
            value={values.websiteUrl}
            onChange={set("websiteUrl")}
            placeholder="youragency.com"
          />
        </div>
      </Card>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-medium text-[#4B5563]">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className="w-full rounded-lg border border-[#E5E5EA] px-3 py-2 text-[14px] transition-all focus:border-[#0071E3] focus:outline-none focus:ring-1 focus:ring-[#0071E3]"
      />
      {hint && <p className="mt-1.5 text-[12px] text-[#86868B]">{hint}</p>}
    </div>
  );
}

/**
 * Pull one human-readable line out of whatever the server action threw.
 *
 * A `ZodError` crossing the action boundary arrives as a message containing a
 * JSON array of issues. Showing that raw is worse than showing nothing, so we
 * take the first `message` if it parses and fall back otherwise.
 */
function firstReadableIssue(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && typeof parsed[0]?.message === "string") {
      return parsed[0].message;
    }
  } catch {
    // Not a serialised ZodError — fall through.
  }
  return raw.length > 0 && raw.length < 160 ? raw : "Could not save.";
}
