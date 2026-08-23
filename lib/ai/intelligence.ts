import type { z } from "zod";
import { prisma } from "@/lib/db";
import { ai } from "./gemini";
import { performSearch } from "./search";
import { IntelligenceSchema, parseAIResponse } from "./schemas";
import { STALE_RUN_TIMEOUT_MS } from "./stale-runs";
import { calculateOpportunityScore, type ScoreInput } from "@/lib/scoring/opportunity-score";

type IntelligenceOutput = z.infer<typeof IntelligenceSchema>;

// ─────────────────────────────────────────────────────────────
// TYPES & SCHEMAS
// ─────────────────────────────────────────────────────────────

interface IntelligenceParams {
  companyId: string;
  workspaceId: string;
}

const intelligenceSchemaDefinition = `
{
  "company_summary": "Detailed summary of the company",
  "business_model": "The business model (e.g., B2B SaaS, D2C E-commerce, Marketplace, etc.)",
  "signals": [
    {
      "type": "Type of signal (e.g., HIRING, FUNDING, PRODUCT_LAUNCH, PAIN_POINT)",
      "title": "Short title",
      "description": "Details of the signal",
      "source": "Where it was found"
    }
  ],
  "problems": ["List of problems the company might be facing based on signals"],
  "why_now": "Why is now a good time to reach out?",
  "recommended_offer": "Which of our offers/services best fits their needs?",
  "buyer_role": "The ideal buyer persona (e.g., VP of Marketing)",
  "recommended_channel": "Best channel to reach out (e.g., EMAIL, LINKEDIN)",
  "reasoning": "Detailed explanation of the AI's inferences and scores",
  "confidence": 0.9,
  "scoring_assessment": {
    "icp_fit": {
      "score": 75,
      "reasoning": "Why this company matches or doesn't match the ideal customer profile (industry, size, geography, tech stack)"
    },
    "problem_evidence": {
      "score": 80,
      "reasoning": "How strong is the evidence that this company has the problems we solve? Cite specific evidence."
    },
    "buying_intent": {
      "score": 60,
      "reasoning": "Are there signals they are actively looking for a solution? (hiring, RFPs, tech changes, complaints)"
    },
    "service_match": {
      "score": 70,
      "reasoning": "How well do our specific offers align with their identified needs?"
    },
    "buyer_confidence": {
      "score": 65,
      "reasoning": "How confident are we in the identified decision maker? Do we have a name, title, contact info?"
    },
    "contactability": {
      "score": 50,
      "reasoning": "Can we actually reach the buyer? Do we have email, LinkedIn, or phone? Is there a gatekeeper?"
    }
  },
  "evidence": [
    {
      "title": "Fact title",
      "summary": "Fact summary",
      "quote": "Direct quote",
      "sourceUrl": "URL",
      "sourceName": "Publisher",
      "sourceType": "web"
    }
  ],
  "decision_makers": [
    {
      "name": "Name",
      "role": "Job Title",
      "email": "Only if found",
      "linkedin_url": "URL",
      "source": "Where found",
      "confidence": 0.8,
      "is_verified": true
    }
  ]
}
`;

// ─────────────────────────────────────────────────────────────
// ENGINE
// ─────────────────────────────────────────────────────────────

export async function researchCompany({ companyId, workspaceId }: IntelligenceParams) {
  // 0. Ownership and duplicate-run guards, both before an AgentRun row exists.
  //
  //    This used to be `findUnique({ where: { id: companyId } })` further down,
  //    with no reference to `workspaceId` at all — so a company id from another
  //    workspace was researched happily, and the resulting Opportunity and
  //    Contacts were written into the *caller's* workspace.
  const company = await prisma.company.findFirst({
    where: { id: companyId, workspaceId },
    include: { workspace: { include: { offers: true, icps: true } } }
  });

  if (!company) throw new Error("That company was not found in your workspace.");

  // Two concurrent researches of the same company would both pass every check
  // below and write two of everything. `inputParams` records which company a
  // run is for so an in-flight one can be found; runs older than the stale
  // timeout are ignored because `sweepStaleRuns` is about to fail them anyway.
  const inFlight = await prisma.agentRun.findFirst({
    where: {
      workspaceId,
      type: "RESEARCH",
      status: { in: ["QUEUED", "RUNNING"] },
      inputParams: { path: ["companyId"], equals: companyId },
      updatedAt: { gt: new Date(Date.now() - STALE_RUN_TIMEOUT_MS) }
    }
  });

  if (inFlight) {
    throw new Error(`Research is already running for ${company.name}. Wait for it to finish before starting another.`);
  }

  // 1. Create AgentRun Trace
  const run = await prisma.agentRun.create({
    data: {
      workspaceId,
      type: "RESEARCH",
      status: "RUNNING",
      startedAt: new Date(),
      title: "Opportunity Intelligence",
      description: `Analyzing company ID: ${companyId}`,
      inputParams: { companyId },
    }
  });

  try {
    // 2. Perform Real Web Search using Serper!
    const searchQuery = `"${company.name}" ${company.domain} recent news OR site:linkedin.com/in/ "${company.name}" (CEO OR Founder OR VP OR Director)`;
    const searchData = await performSearch(searchQuery);
    
    // No mock-search fallback. performMockSearch() used to fabricate a funding
    // round, an expansion story and two named people with invented email
    // addresses whenever Serper was unavailable — and the model then extracted
    // those people into the Contact table as real buyers, while the prompt
    // below was busy telling it not to hallucinate exactly such names. If the
    // search produced nothing there is no source material to research, so fail
    // with the real reason and let the handler mark this AgentRun FAILED.
    if (!searchData || !Array.isArray(searchData.organic) || searchData.organic.length === 0) {
      throw new Error(
        `Web search returned no results for ${company.name} (${company.domain || "no domain"}). ` +
        `Serper is missing SERPER_API_KEY, failing, or matched nothing — see the search error logged above. ` +
        `Cannot research a company with no source material.`
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let searchContext: string = searchData.organic.map((res: any) => `Title: ${res.title}\nSnippet: ${res.snippet}\nLink: ${res.link}`).join('\n\n');
    
    // Sanitize context to prevent prompt injection
    searchContext = sanitizeText(searchContext);

    // 3. AI Inference & Extraction
    const prompt = buildPrompt(company, searchContext);
    
    // Retry logic (up to 3 attempts with exponential backoff)
    let response;
    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      try {
        response = await ai.chat.completions.create({
          model: "openai/gpt-oss-120b",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          temperature: 0.2
        });
        break; // Success
      } catch (err) {
        retries++;
        console.warn(`Intelligence extraction attempt ${retries} failed:`, err);
        if (retries >= maxRetries) throw err;
        await new Promise(resolve => setTimeout(resolve, retries * 1000));
      }
    }

    if (!response?.choices[0].message.content) throw new Error("AI returned no output");

    // Validate before writing anything. The engine writes evidence, signals, an
    // opportunity and contacts in sequence, so an unchecked field that only
    // fails at step 6 leaves half a research run committed to the database.
    const data = parseAIResponse(
      response.choices[0].message.content,
      IntelligenceSchema,
      `Research of ${company.name} failed`
    );

    // 4. Calculate Scores using the REAL scoring engine
    const scoreInput = mapAIOutputToScoreInput(data);
    const scores = calculateOpportunityScore(scoreInput);

    // 5–8 and 10. One transaction.
    //
    // These five write steps used to run as five loose sequences of `create`
    // calls. Anything that threw partway — a bad enum, a dropped connection, a
    // serverless timeout — left the company with evidence and signals but no
    // opportunity, or an opportunity with no score, and the AgentRun marked
    // FAILED next to data that had in fact been committed. Now either all of it
    // lands or none of it does.
    //
    // Each insert is deduplicated on a natural key so re-running research tops
    // the company up instead of writing a second copy of everything. There are
    // no unique constraints backing this — adding them needs migrations, which
    // is P2 item 19 — so the checks are explicit queries inside the transaction.
    const opportunity = await prisma.$transaction(async (tx) => {
      // 5. Store VERIFIED EVIDENCE
      for (const ev of data.evidence) {
        const duplicate = await tx.evidence.findFirst({
          where: { companyId, title: ev.title }
        });
        if (duplicate) continue;

        await tx.evidence.create({
          data: {
            companyId,
            title: ev.title,
            summary: ev.summary ?? "",
            quote: ev.quote || "",
            // No invented citation. This used to fall back to a Google search URL
            // for the company name, which reads like a source but proves nothing —
            // the column is nullable, so an uncited fact stays visibly uncited.
            sourceUrl: ev.sourceUrl || null,
            sourceName: ev.sourceName || "Web Search",
            sourceType: ev.sourceType || "web",
            isVerified: false // MUST NOT blindly trust AI verification
          }
        });
      }

      // 6. Store AI INFERENCE (Signals)
      for (const sig of data.signals) {
        const duplicate = await tx.signal.findFirst({
          where: { companyId, type: sig.type, title: sig.title }
        });
        if (duplicate) continue;

        await tx.signal.create({
          data: {
            companyId,
            type: sig.type, // Already narrowed to a valid SignalType by the schema
            title: sig.title,
            description: sig.description,
            sourceName: sig.source || "AI Inference",
            // Not scored. This was hardcoded to 0.8, which made every signal look
            // equally and confidently relevant; nothing computes a real value yet.
            relevance: null
          }
        });
      }

      // 7. Store Opportunity & Scores
      //
      // Reuse the one a previous research run left behind if the user hasn't
      // acted on it yet. Once it leaves NEW it represents real pipeline history
      // — an approval, a rejection, a conversation — so a re-run adds a new one
      // beside it rather than overwriting that.
      const narrative = {
        problemStatement: data.problems?.join("\n") || "",
        whyNow: data.why_now,
        opportunitySummary: data.reasoning,
        aiReasoning: data.reasoning,
        aiConfidence: data.confidence,
        recommendedService: data.recommended_offer,
        recommendedBuyerRole: data.buyer_role,
      };
      const scoreFields = {
        icpFitScore: scores.icpFit,
        problemEvidenceScore: scores.problemEvidence,
        buyingIntentScore: scores.buyingIntent,
        serviceMatchScore: scores.serviceMatch,
        buyerConfidenceScore: scores.buyerConfidence,
        contactabilityScore: scores.contactability,
        overallScore: scores.overall,
      };

      const reusable = await tx.opportunity.findFirst({
        where: { companyId, workspaceId, status: "NEW" },
        orderBy: { createdAt: "desc" }
      });

      let opp;
      if (reusable) {
        opp = await tx.opportunity.update({
          where: { id: reusable.id },
          data: narrative
        });
        await tx.opportunityScore.upsert({
          where: { opportunityId: opp.id },
          create: { opportunityId: opp.id, ...scoreFields },
          update: scoreFields
        });
      } else {
        opp = await tx.opportunity.create({
          data: {
            companyId,
            workspaceId,
            status: "NEW",
            ...narrative,
            score: { create: scoreFields }
          }
        });
      }

      // 8. Store Decision Makers
      for (const dm of data.decision_makers ?? []) {
        const fullName = dm.name && dm.name !== "Unknown" && dm.name !== ""
          ? dm.name
          : `[Target] ${dm.role}`;

        // An email identifies a person; without one, the name has to.
        const duplicate = await tx.contact.findFirst({
          where: dm.email
            ? { companyId, email: dm.email }
            : { companyId, fullName }
        });
        if (duplicate) continue;

        await tx.contact.create({
          data: {
            workspaceId,
            companyId,
            opportunityId: opp.id,
            fullName,
            title: dm.role,
            email: dm.email || null,
            linkedinUrl: dm.linkedin_url || null,
            sourceName: dm.source || "AI Inference",
            isVerified: dm.is_verified || false,
            buyerScore: dm.confidence ? dm.confidence * 100 : null
          }
        });
      }

      // 10. Update Company
      await tx.company.update({
        where: { id: companyId },
        data: {
          businessModel: data.business_model,
          description: data.company_summary,
          status: "RESEARCHED",
          researchedAt: new Date(),
          researchScore: scores.overall,
          scoreGrade: scores.grade
        }
      });

      return opp;
    }, {
      // The default 5s is too tight: the loops above issue a dedupe query per
      // evidence item, signal and contact, and the model can return a dozen of
      // each. Nothing in here makes a network call, so the ceiling is database
      // round-trips, not third-party latency.
      timeout: 30_000
    });

    // 9. Hunter.io Contact Enrichment — only for high-scoring leads (score >= 70)
    //    to preserve the 50 credits/month free tier.
    //
    //    Deliberately outside the transaction above: it makes an HTTP request to
    //    a third party, and holding a database transaction open across a network
    //    call to a service that may be slow or down is how connection pools get
    //    exhausted. It is also purely additive and already non-fatal, so it has
    //    nothing to roll back.
    if (scores.overall >= 70 && company.domain) {
      try {
        const hunterKey = process.env.HUNTER_API_KEY;
        if (hunterKey) {
          const hunterUrl = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(company.domain)}&api_key=${hunterKey}&limit=5&type=personal`;
          const hunterRes = await fetch(hunterUrl);
          if (hunterRes.ok) {
            const hunterData = await hunterRes.json();
            const hunterContacts = hunterData?.data?.emails || [];
            let savedCount = 0;

            for (const contact of hunterContacts) {
              if (!contact.value || !contact.first_name) continue;
              // Avoid duplicating contacts already found by AI
              const existingContact = await prisma.contact.findFirst({
                where: { companyId, email: contact.value }
              });
              if (existingContact) continue;

              await prisma.contact.create({
                data: {
                  workspaceId,
                  companyId,
                  opportunityId: opportunity.id,
                  fullName: `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
                  title: contact.position || contact.department || "Unknown Role",
                  email: contact.value,
                  linkedinUrl: contact.linkedin || null,
                  sourceName: "Hunter.io",
                  isVerified: contact.verification?.status === "valid",
                  buyerScore: contact.confidence || null
                }
              });
              savedCount++;
            }

            if (savedCount > 0) {
              console.log(`Hunter.io: Saved ${savedCount} real verified contacts for ${company.name}`);
            }
          }
        }
      } catch (hunterErr) {
        // Non-fatal: log and continue without crashing the intelligence run
        console.error("Hunter.io enrichment failed (non-fatal):", hunterErr);
      }
    }

    // 11. Mark Run Completed
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        outputData: { rawOutput: data, scores } as any,
        resultSummary: `Analyzed with score ${scores.overall} (Grade: ${scores.grade}, ${scores.qualifies ? 'QUALIFIED' : 'NOT QUALIFIED'})`
      }
    });

    return opportunity;

  } catch (error: unknown) {
    console.error("Intelligence Engine Error:", error);
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : String(error)
      }
    });
    
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildPrompt(company: any, searchContext: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const offers = company.workspace?.offers?.map((o: any) => o.name).join(", ") || "Conversion Optimization, Lead Gen, Outbound Sales";
  
  return `
You are an elite B2B revenue intelligence AI. Analyze the following company based on the search context provided.

Company: ${company.name} (${company.domain})
Search Context: ${searchContext}
Our Available Offers: ${offers}

Your task:
1. Extract VERIFIED EVIDENCE from the search context (facts, funding, news). Do not fabricate anything.
2. Generate AI INFERENCES (problems, why_now, best offer match, buyer role) based strictly on the evidence.
3. Identify DECISION MAKERS: For the identified problem/opportunity, figure out who the most relevant buyer is. 
   - DO NOT automatically choose the CEO. Think about the department (e.g., E-commerce/CRO -> Head of E-commerce, Engineering -> VP Engineering, etc.)
   - Look closely at the Search Context for specific names and LinkedIn profiles (e.g. from site:linkedin.com results). 
   - If specific names or contact details are found in the Search Context, extract them and set is_verified to true. 
   - CRITICAL: If no specific names are found in the context, output the recommended job title as the "role" (e.g. "VP of Sales"), but leave the "name" blank or as "Unknown", and set is_verified to false. Do not hallucinate names like "Sarah Jenkins" or "Marcus Ryle".
4. Return the result in the requested JSON structure exactly matching this schema:
${intelligenceSchemaDefinition}
  `;
}

/**
 * Maps the raw AI output into proper ScoreInput for the real scoring engine.
 * Each factor is derived from the AI's independent assessment rather than
 * a single self-reported confidence number.
 */
function mapAIOutputToScoreInput(data: IntelligenceOutput): ScoreInput {
  const assessment = data.scoring_assessment;

  // If the AI returned proper per-factor assessments, use them directly
  if (assessment && typeof assessment === 'object') {
    return {
      icpFit: clampScore(assessment.icp_fit?.score),
      problemEvidence: clampScore(assessment.problem_evidence?.score),
      buyingIntent: clampScore(assessment.buying_intent?.score),
      serviceMatch: clampScore(assessment.service_match?.score),
      buyerConfidence: clampScore(assessment.buyer_confidence?.score),
      contactability: clampScore(assessment.contactability?.score),
    };
  }

  // Fallback: derive scores from structural evidence in the AI output
  // This is still better than the old approach because each factor is
  // independently evaluated based on what the AI actually found
  const hasProblems = data.problems.length > 0;
  const hasSignals = data.signals.length > 0;
  const hasEvidence = data.evidence.length > 0;
  const hasDecisionMakers = data.decision_makers.length > 0;
  const hasVerifiedContacts = data.decision_makers.some(dm => dm.email || dm.is_verified);

  return {
    icpFit: hasEvidence ? 65 + Math.min(25, data.evidence.length * 8) : 40,
    problemEvidence: hasProblems ? 50 + Math.min(40, data.problems.length * 15) : 20,
    buyingIntent: hasSignals ? 40 + Math.min(50, data.signals.length * 12) : 15,
    serviceMatch: data.recommended_offer ? 70 : 30,
    buyerConfidence: hasDecisionMakers
      ? 40 + Math.min(50, data.decision_makers.length * 20)
      : (data.buyer_role ? 35 : 10),
    contactability: hasVerifiedContacts ? 75 : (hasDecisionMakers ? 45 : 15),
  };
}

/** Clamp a score value to 0-100, defaulting to 0 if missing */
function clampScore(value: unknown): number {
  const num = typeof value === 'number' ? value : 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

/** Sanitize text to remove common prompt injection vectors and excessive whitespace */
export function sanitizeText(text: string): string {
  if (!text) return "";
  return text
    .replace(/<\|.*?\|>/g, '') // Remove special tokens
    .replace(/(ignore previous instructions|system:|user:|assistant:|you are a)/gi, '[REDACTED]') // Block direct injections
    .replace(/<[^>]*>?/gm, '') // Remove stray HTML tags
    .replace(/\s+/g, ' ') // Collapse whitespace
    .trim()
    .substring(0, 15000); // Hard cap on length
}
