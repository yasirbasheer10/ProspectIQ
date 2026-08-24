"use client";

import { useState, useTransition, useEffect } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ArrowLeft, Globe, MapPin, Building, CheckCircle2, Sparkles, Lightbulb, X, Mail, Send, Loader2, BrainCircuit, RotateCcw } from "lucide-react";
import Link from "next/link";
import { triggerIntelligenceRun, generateOutreachAction, updateOutreachAction } from "./actions";
import { getScoreColor, getGrade } from "@/lib/scoring/opportunity-score";

interface Company360ClientProps {
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  company: any;
}

export function Company360Client({ company }: Company360ClientProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isGeneratingOutreach, startGeneratingOutreach] = useTransition();
  const [isUpdatingOutreach, startUpdatingOutreach] = useTransition();
  
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");

  const handleRunIntelligence = () => {
    startTransition(async () => {
      // Workspace comes from the session now, not from the page's props.
      await triggerIntelligenceRun(company.id);
    });
  };

  if (!company) {
    return (
      <div className="flex h-full flex-col bg-white overflow-hidden items-center justify-center">
        <p className="text-[#86868B]">Company not found.</p>
        <Link href="/companies" className="mt-4">
          <Button variant="ghost">Back to Companies</Button>
        </Link>
      </div>
    );
  }

  // Derive highest score from opportunities. No fallback: this used to read
  // `?? (status === "DISCOVERED" ? null : 70 + (company.name.length % 25))`, so
  // a company that had never been researched showed an invented 70-94 as its
  // "Confidence Score" — and, worse, the invented number satisfied the `score ?`
  // check below, which hid the "Run Intelligence" button that would have
  // produced a real one.
  const scoreObj = company.opportunities?.[0]?.score;
  const score: number | null = scoreObj?.overallScore ?? null;

  // Merge real evidence and signals
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  const realEvidence = company.evidence?.map((e: any) => ({
    type: "VERIFIED FACT",
    title: e.summary || e.title,
    source: e.sourceName || e.sourceUrl,
    isAI: false
  })) || [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
  const realSignals = company.signals?.map((s: any) => ({
    type: `AI INFERENCE: ${s.type}`,
    title: s.title,
    source: s.sourceName || "Agent Analysis",
    isAI: true
  })) || [];

  const evidence = [...realEvidence, ...realSignals];

  const decisionMakers = company.contacts || [];

  const opportunity = company?.opportunities?.[0];
  const targetContact = decisionMakers[0];
  const outreachMessage = opportunity?.outreachMessages?.[0];

// eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (outreachMessage) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditSubject(outreachMessage.subject || "");
      setEditBody(outreachMessage.body || "");
    }
  }, [outreachMessage]);

  const handleGenerateOutreach = () => {
    if (!opportunity || !targetContact) return;
    startGeneratingOutreach(async () => {
      await generateOutreachAction(company.id, opportunity.id, targetContact.id, outreachMessage?.id);
    });
  };

  const handleUpdateOutreachStatus = (status: "APPROVED" | "REJECTED") => {
    if (!outreachMessage) return;
    startUpdatingOutreach(async () => {
      await updateOutreachAction(company.id, outreachMessage.id, { status, subject: editSubject, body: editBody });
      if (status === "APPROVED") setDrawerOpen(false);
    });
  };

  return (
    <div className="flex h-full flex-col bg-white overflow-hidden relative">
      <Topbar
        title=""
        actions={
          <Link href="/companies">
            <Button variant="ghost" size="sm" icon={ArrowLeft}>Back to Companies</Button>
          </Link>
        }
      />

      <main className="flex-1 overflow-y-auto p-12">
        <div className="mx-auto max-w-4xl">
          
          {/* Header */}
          <div className="flex items-center gap-4 mb-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-[10px] bg-[#F5F5F7] border border-[#E5E5EA] text-[20px] font-semibold text-[#4B5563]">
              {company.name[0]}
            </div>
            <div>
              <h1 className="text-3xl font-medium tracking-tight text-[#1D1D1F] mb-1.5">{company.name}</h1>
              <div className="flex items-center gap-4 text-[13px] text-[#4B5563]">
                <div className="flex items-center gap-1.5">
                  <Globe size={14} /> 
                  <a href={`https://${company.domain}`} target="_blank" rel="noopener noreferrer" className="hover:underline text-[#0071E3]">
                    {company.domain}
                  </a>
                </div>
                <div className="w-px h-3 bg-[#E5E5EA]" />
                <div className="flex items-center gap-1.5"><MapPin size={14} /> {company.headquarters || company.country || 'N/A'}</div>
                <div className="w-px h-3 bg-[#E5E5EA]" />
                <div className="flex items-center gap-1.5"><Building size={14} /> {company.industry || 'N/A'}</div>
              </div>
            </div>
          </div>

          {/* Headline & Score */}
          <div className="flex items-start justify-between mb-16">
            <h2 className="text-5xl font-medium tracking-tight text-[#1D1D1F] max-w-2xl leading-tight">
              {score && score > 85 ? "High-confidence conversion opportunity detected." : 
               score && score > 70 ? "Potential opportunity detected." :
               "Researching signals..."}
            </h2>
            <div className="flex flex-col items-end">
              <span className="text-[11px] font-semibold text-[#86868B] uppercase tracking-widest mb-2">Confidence Score</span>
              {score !== null ? (
                <div className="flex items-center gap-3">
                  <span className={`text-6xl font-medium tracking-tighter ${getScoreColor(score)}`}>{score}</span>
                  {/* Was `score > 80 && <Badge>High</Badge>` — a third threshold
                      that agreed with neither the grades nor the colours. */}
                  <Badge variant="info" className="px-3 py-1 bg-[#0071E3]/10 text-[#0071E3] rounded-full text-xs font-semibold">
                    Grade {getGrade(score)}
                  </Badge>
                </div>
              ) : (
                <Button 
                  variant="primary" 
                  onClick={handleRunIntelligence} 
                  loading={isPending}
                  icon={BrainCircuit}
                >
                  {isPending ? "Running AI..." : "Run Intelligence"}
                </Button>
              )}
            </div>
          </div>

          {/* Overview & Why it matters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 mb-16">
            <div>
              <h3 className="text-xl font-medium text-[#1D1D1F] mb-4">Overview</h3>
              <p className="text-[15px] leading-relaxed text-[#4B5563] mb-4">{company.description || "No overview available."}</p>
              {company.businessModel && (
                <div className="inline-block px-3 py-1 bg-[#F5F5F7] border border-[#E5E5EA] rounded-full text-xs font-semibold text-[#6E6E73]">
                  {company.businessModel}
                </div>
              )}
            </div>
            <div>
              <h3 className="text-xl font-medium text-[#1D1D1F] mb-4">Why it matters</h3>
              <p className="text-[15px] leading-relaxed text-[#4B5563]">
                {company.opportunities?.[0]?.whyNow || "A major redesign of core transactional flows suggests a strategic imperative to improve unit economics. They are likely experiencing friction in their current funnel, presenting a timely window for specialized conversion optimization solutions."}
              </p>
              {company.opportunities?.[0]?.problemStatement && (
                <div className="mt-4 p-4 bg-[#FFF8F2] border border-[#FFE8D6] rounded-xl">
                  <h4 className="text-[13px] font-semibold text-[#C25100] uppercase tracking-wider mb-2">Identified Problems</h4>
                  <p className="text-[14px] text-[#4B5563]">{company.opportunities[0].problemStatement}</p>
                </div>
              )}
            </div>
          </div>
          
          <div className="w-full h-px bg-[#E5E5EA] mb-16" />

          {/* Evidence & Right Column Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-16 mb-24">
            {/* Evidence */}
            <div className="pr-8">
              <h3 className="text-xl font-medium text-[#1D1D1F] mb-8">Evidence</h3>
              <div className="space-y-8 relative before:absolute before:inset-0 before:ml-[11px] before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-[#E5E5EA] before:to-transparent">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {evidence.length > 0 ? evidence.map((item: any, i: number) => (
                <div key={i} className="relative flex items-start gap-6">
                  <div className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${item.isAI ? 'border-[#0071E3] bg-white' : 'border-[#E5E5EA] bg-[#F5F5F7]'} z-10`}>
                    {item.isAI ? <Sparkles size={12} className="text-[#0071E3]" /> : <CheckCircle2 size={12} className="text-[#86868B]" />}
                  </div>
                  <div className="pt-1 bg-white px-2">
                    <span className={`text-[11px] font-semibold uppercase tracking-widest ${item.isAI ? 'text-[#0071E3]' : 'text-[#86868B]'} mb-2 block`}>
                      {item.type}
                    </span>
                    <p className="text-[15px] font-medium text-[#1D1D1F] mb-2">{item.title}</p>
                    <p className="text-[13px] text-[#4B5563]">{item.source}</p>
                  </div>
                </div>
              )) : (
                // This list used to be seeded with two fixtures when it was
                // empty — "Company recently redesigned checkout", sourced to
                // "Website telemetry (Detected 48h ago)" and labelled VERIFIED
                // FACT. Nothing had been detected and there is no telemetry.
                <p className="text-[#86868B] text-[14px]">
                  No evidence collected yet. Run intelligence on this company to gather it.
                </p>
              )}
            </div>
          </div>
            
            {/* Right Column: Decision Makers & Recommended Action */}
            <div className="flex flex-col gap-16">
              {/* Decision Makers */}
              <div>
                <h3 className="text-xl font-medium text-[#1D1D1F] mb-8">Decision Makers</h3>
                <div className="space-y-6">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {decisionMakers.length > 0 ? decisionMakers.map((person: any, idx: number) => {
                    const displayName = person.fullName || person.name || (person.firstName && person.lastName ? `${person.firstName} ${person.lastName}` : "Unknown Contact");
                    return (
                    <div key={idx} className="flex flex-col gap-3 p-4 rounded-[12px] border border-[#E5E5EA] bg-[#FAFAFC]">
                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white border border-[#E5E5EA] text-[15px] font-medium text-[#4B5563]">
                          {person.initials || displayName[0]}
                        </div>
                        <div className="flex-1">
                          <p className="text-[15px] font-medium text-[#1D1D1F] flex items-center gap-2">
                            {displayName}
                            {person.isVerified && <CheckCircle2 size={14} className="text-[#0071E3]" />}
                          </p>
                          <p className="text-[13px] text-[#86868B]">{person.title}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="default" className="text-[11px] font-medium bg-[#E5E5EA]/50 text-[#4B5563] hover:bg-[#E5E5EA]/50">
                          {person.isVerified ? "Verified" : "Unverified"}
                        </Badge>
                        {person.buyerScore && (
                          <Badge variant="default" className="text-[11px] font-medium bg-[#E5EDFF] text-[#0071E3] hover:bg-[#E5EDFF]">
                            Confidence: {person.buyerScore}%
                          </Badge>
                        )}
                        {person.sourceName && (
                          <span className="text-[12px] text-[#86868B] flex items-center gap-1">
                            <Globe size={10} />
                            {person.sourceName}
                          </span>
                        )}
                      </div>
                      {person.email && (
                        <p className="text-[12px] text-[#86868B] flex items-center gap-1 mt-1">
                          <Mail size={12}/> {person.email}
                        </p>
                      )}
                    </div>
                  )}) : (
                    <p className="text-[#86868B] text-[14px]">No decision makers identified yet.</p>
                  )}
                </div>
              </div>

              {/* Recommended Action Card */}
              <div className="rounded-[20px] bg-[#F5F8FF] p-8 border border-[#E5EDFF]">
                <div className="flex items-center gap-3 mb-4">
                  <Lightbulb size={24} className="text-[#0071E3]" />
                  <h3 className="text-xl font-medium text-[#1D1D1F]">Recommended Action</h3>
                </div>
                <p className="text-[14px] leading-relaxed text-[#4B5563] mb-8">
                  {company.opportunities?.[0]?.recommendedService ?
                    `Initiate outbound sequence offering ${company.opportunities[0].recommendedService}. Highlight our relevant case studies to establish trust.` :
                    // Was "Mention their recent redesign to establish relevance"
                    // — a specific claim about a company nothing had researched.
                    "No recommendation yet. Run intelligence on this company to match it to one of your offers."}
                </p>
                <Button variant="primary" size="md" onClick={() => setDrawerOpen(true)} className="w-full justify-center">
                  Draft Outreach Sequence
                </Button>
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* Slide-out Drawer Overlay */}
      {drawerOpen && (
        <div className="absolute inset-0 z-50 flex justify-end">
          <div 
            className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="relative w-[500px] h-full bg-white shadow-2xl flex flex-col border-l border-[#E5E5EA] animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between p-6 border-b border-[#E5E5EA]">
              <div>
                <h3 className="text-xl font-medium text-[#1D1D1F]">AI Outreach Studio</h3>
                <p className="text-[13px] text-[#86868B]">Sequence targeting {company.name}</p>
              </div>
              <Button variant="ghost" size="sm" icon={X} onClick={() => setDrawerOpen(false)} />
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 flex flex-col">
              {!outreachMessage && !isGeneratingOutreach ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-16 h-16 bg-[#F5F8FF] rounded-full flex items-center justify-center text-[#0071E3] mb-2">
                    <Sparkles size={28} />
                  </div>
                  <h3 className="text-lg font-medium text-[#1D1D1F]">Generate Personalized Outreach</h3>
                  <p className="text-[14px] text-[#86868B] max-w-[280px]">
                    Instantly draft an evidence-backed email specifically tailored to {targetContact?.fullName || targetContact?.name || targetContact?.firstName || 'the target contact'}&apos;s role and current company initiatives.
                  </p>
                  <Button variant="primary" loading={isGeneratingOutreach} onClick={handleGenerateOutreach} className="mt-4" disabled={!targetContact}>
                    Generate AI Outreach
                  </Button>
                </div>
              ) : isGeneratingOutreach ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
                  <Loader2 className="w-10 h-10 animate-spin text-[#0071E3] mb-2" />
                  <h3 className="text-lg font-medium text-[#1D1D1F]">Analyzing Evidence...</h3>
                  <p className="text-[14px] text-[#86868B]">Drafting a highly personalized message.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {outreachMessage?.status === 'APPROVED' && (
                    <div className="bg-[#E5F7ED] border border-[#B7EACD] p-3 rounded-lg flex items-center gap-2 text-[#108945]">
                      <CheckCircle2 size={16} />
                      <span className="text-[13px] font-medium">Message Approved and ready to send.</span>
                    </div>
                  )}
                  {outreachMessage?.personalizationNotes && (
                    <div className="bg-[#F5F8FF] border border-[#E5EDFF] p-4 rounded-[12px]">
                      <h4 className="text-[12px] font-semibold text-[#0071E3] uppercase tracking-wider mb-1">AI Reasoning</h4>
                      <p className="text-[13px] text-[#4B5563]">{outreachMessage.personalizationNotes}</p>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <label className="text-[12px] font-medium text-[#86868B] uppercase tracking-wider mb-2 block">To</label>
                      <div className="flex items-center gap-2 bg-[#F5F5F7] p-2 rounded-lg border border-[#E5E5EA]">
                        <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-[10px] font-bold text-[#4B5563]">
                          {targetContact?.initials || targetContact?.fullName?.[0] || targetContact?.name?.[0] || targetContact?.firstName?.[0] || "?"}
                        </div>
                        <span className="text-[14px] font-medium text-[#1D1D1F]">
                          {targetContact?.fullName || targetContact?.name || (targetContact?.firstName && targetContact?.lastName ? `${targetContact?.firstName} ${targetContact?.lastName}` : "Unknown Contact")} {targetContact?.title ? `(${targetContact.title})` : ""}
                        </span>
                      </div>
                    </div>
                    
                    <div>
                      <label className="text-[12px] font-medium text-[#86868B] uppercase tracking-wider mb-2 block">Subject</label>
                      <input 
                        type="text" 
                        value={editSubject}
                        onChange={(e) => setEditSubject(e.target.value)}
                        className="w-full text-[14px] p-3 rounded-lg border border-[#E5E5EA] focus:outline-none focus:border-[#0071E3] shadow-sm"
                      />
                    </div>

                    <div>
                      <label className="text-[12px] font-medium text-[#86868B] uppercase tracking-wider mb-2 block">Message</label>
                      <textarea 
                        rows={12}
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        className="w-full text-[14px] p-3 rounded-lg border border-[#E5E5EA] focus:outline-none focus:border-[#0071E3] shadow-sm resize-none leading-relaxed"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {outreachMessage && !isGeneratingOutreach && (
              <div className="p-6 border-t border-[#E5E5EA] bg-[#F9F9FB] flex justify-between items-center">
                <Button 
                  variant="ghost" 
                  icon={RotateCcw} 
                  loading={isGeneratingOutreach} 
                  onClick={handleGenerateOutreach}
                >
                  Regenerate
                </Button>
                <div className="flex items-center gap-3">
                  <Button variant="danger" loading={isUpdatingOutreach} onClick={() => handleUpdateOutreachStatus("REJECTED")}>Reject</Button>
                  <Button variant="primary" icon={Send} loading={isUpdatingOutreach} onClick={() => handleUpdateOutreachStatus("APPROVED")}>Approve</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
