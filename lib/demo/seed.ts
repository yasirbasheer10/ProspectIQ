/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Demo Database Seeder
 * 
 * Seeds the database with demo fixture data.
 * Safe to run multiple times (idempotent via upsert).
 */

import { prisma } from "@/lib/db";
import {
  DEMO_COMPANIES,
  DEMO_SIGNALS,
  DEMO_CONTACTS,
  DEMO_ICP,
  DEMO_OFFER,
  DEMO_OPPORTUNITIES,
  DEMO_AGENT_RUNS,
  DEMO_SEQUENCES,
  DEMO_OUTREACH,
  DEMO_CONVERSATIONS,
} from "./fixtures";


export async function seedDemoData(workspaceId: string): Promise<{
  companies: number;
  signals: number;
  contacts: number;
  opportunities: number;
}> {
  console.log("🌱 Seeding demo data for workspace:", workspaceId);

  // ─── Seed ICP ─────────────────────────────────────────────
  const icp = await prisma.iCP.upsert({
    where: { id: `demo-icp-${workspaceId}` },
    update: {},
    create: {
      id: `demo-icp-${workspaceId}`,
      name: DEMO_ICP.name,
      description: DEMO_ICP.description,
      industries: DEMO_ICP.industries,
      companySizeMin: DEMO_ICP.companySizeMin,
      companySizeMax: DEMO_ICP.companySizeMax,
      geographies: DEMO_ICP.geographies,
      regions: DEMO_ICP.regions,
      technologies: DEMO_ICP.technologies,
      businessModel: DEMO_ICP.businessModel,
      buyingSignals: DEMO_ICP.buyingSignals,
      excludeKeywords: DEMO_ICP.excludeKeywords,
      excludedIndustries: DEMO_ICP.excludedIndustries,
      buyerRoles: DEMO_ICP.buyerRoles,
      workspaceId,
    },
  });

  // ─── Seed Offer ────────────────────────────────────────────
  const offer = await prisma.offer.upsert({
    where: { id: `demo-offer-${workspaceId}` },
    update: {},
    create: {
      id: `demo-offer-${workspaceId}`,
      name: DEMO_OFFER.name,
      description: DEMO_OFFER.description,
      valueProposition: DEMO_OFFER.valueProposition,
      services: DEMO_OFFER.services,
      targetProblems: DEMO_OFFER.targetProblems,
      differentiators: DEMO_OFFER.differentiators,
      buyerRoles: DEMO_OFFER.buyerRoles,
      relevantIndustries: DEMO_OFFER.relevantIndustries,
      workspaceId,
    },
  });

  // ─── Seed Companies ────────────────────────────────────────
  const companyMap: Record<string, string> = {};

  for (const c of DEMO_COMPANIES) {
    const company = await prisma.company.upsert({
      where: { workspaceId_domain: { workspaceId, domain: c.domain } },
      update: { status: c.status },
      create: {
        name: c.name,
        domain: c.domain,
        website: c.website,
        description: c.description,
        industry: c.industry,
        employeeRange: c.employeeRange,
        employeeCount: c.employeeCount,
        revenueRange: c.revenueRange,
        headquarters: c.headquarters,
        country: c.country,
        technologies: c.technologies,
        status: c.status,
        discoverySource: c.discoverySource,
        researchedAt: c.status !== "DISCOVERED" ? new Date() : null,
        workspaceId,
      },
    });
    companyMap[c.name] = company.id;
  }

  // ─── Seed Signals ─────────────────────────────────────────
  let signalCount = 0;
  for (const s of DEMO_SIGNALS) {
    const companyId = companyMap[s.companyName];
    if (!companyId) continue;

    const existing = await prisma.signal.findFirst({
      where: { companyId, title: s.title },
    });

    if (!existing) {
      const signal = await prisma.signal.create({
        data: {
          type: s.type,
          title: s.title,
          description: s.description,
          sourceUrl: s.sourceUrl,
          sourceName: s.sourceName,
          relevance: s.relevance,
          companyId,
        },
      });

      // Create supporting evidence for each signal
      await prisma.evidence.create({
        data: {
          title: s.title,
          summary: s.description,
          sourceUrl: s.sourceUrl,
          sourceName: s.sourceName,
          sourceType: guessSourceType(s.sourceName),
          companyId,
          signalId: signal.id,
          isVerified: true,
        },
      });

      signalCount++;
    }
  }

  // ─── Seed Contacts ────────────────────────────────────────
  let contactCount = 0;
  for (const c of DEMO_CONTACTS) {
    const companyId = companyMap[c.companyName];
    if (!companyId) continue;

    const existing = await prisma.contact.findFirst({
      where: { companyId, email: c.email },
    });

    if (!existing) {
      await prisma.contact.create({
        data: {
          fullName: c.fullName,
          firstName: c.firstName,
          lastName: c.lastName,
          title: c.title,
          seniority: c.seniority,
          department: c.department,
          linkedinUrl: c.linkedinUrl,
          email: c.email,
          emailStatus: "UNVERIFIED",
          emailSource: c.sourceName,
          sourceUrl: c.sourceUrl,
          sourceName: c.sourceName,
          buyerScore: c.buyerScore,
          companyId,
          workspaceId,
        },
      });
      contactCount++;
    }
  }

  // ─── Seed Opportunities ───────────────────────────────────
  let oppCount = 0;
  for (const o of DEMO_OPPORTUNITIES) {
    const companyId = companyMap[o.companyName];
    if (!companyId) continue;

    const existing = await prisma.opportunity.findFirst({ where: { companyId, workspaceId } });
    if (!existing) {
      await prisma.opportunity.create({
        data: {
          problemStatement: o.problemStatement,
          whyNow: o.whyNow,
          opportunitySummary: o.opportunitySummary,
          score: {
            create: {
              icpFitScore: o.icpFitScore,
              problemEvidenceScore: o.problemEvidenceScore,
              buyingIntentScore: o.buyingIntentScore,
              serviceMatchScore: o.serviceMatchScore,
              buyerConfidenceScore: o.buyerConfidenceScore,
              contactabilityScore: o.contactabilityScore,
              overallScore: o.overallScore,
            }
          },
          recommendedService: o.recommendedService,
          recommendedBuyerRole: o.recommendedBuyerRole,
          recommendedChannel: o.recommendedChannel as any,
          status: o.status,
          companyId,
          workspaceId,
          icpId: icp.id,
          offerId: offer.id,
        },
      });
      oppCount++;
    }
  }

  // ─── Seed Agent Runs ─────────────────────────────────────
  for (const run of DEMO_AGENT_RUNS) {
    await prisma.agentRun.create({
      data: {
        ...run,
        workspaceId,
      },
    });
  }

  // ─── Seed Sequences ───────────────────────────────────────
  for (const s of DEMO_SEQUENCES) {
    await prisma.sequence.upsert({
      where: { id: s.id },
      update: {},
      create: {
        id: s.id,
        name: s.name,
        description: s.description,
        status: s.status as any,
        workspaceId,
      },
    });
  }

  // ─── Seed Outreach ────────────────────────────────────────
  for (const o of DEMO_OUTREACH) {
    const companyId = companyMap[o.companyName];
    if (!companyId) continue;
    
    const contact = await prisma.contact.findFirst({ where: { companyId, email: o.contactEmail } });
    if (!contact) continue;

    await prisma.outreachMessage.create({
      data: {
        subject: o.subject,
        body: o.body,
        status: o.status as any,
        channel: o.type as any,
        contactId: contact.id,
        sequenceId: o.sequenceId,
      },
    });
  }

  // ─── Seed Conversations ───────────────────────────────────
  for (const conv of DEMO_CONVERSATIONS) {
    const companyId = companyMap[conv.companyName];
    if (!companyId) continue;
    
    const contact = await prisma.contact.findFirst({ where: { companyId, email: conv.contactEmail } });
    if (!contact) continue;

    const conversation = await prisma.conversation.create({
      data: {
        status: conv.status as any,
        contactId: contact.id,
        workspaceId,
      },
    });

    for (const msg of conv.messages) {
      await prisma.conversationMessage.create({
        data: {
          direction: msg.direction as any,
          body: msg.body,
          sentAt: msg.createdAt,
          classification: msg.intent as any,
          suggestedReply: msg.suggestedResponse,
          conversationId: conversation.id,
        },
      });
    }
  }

  console.log(`✅ Demo seed complete: ${DEMO_COMPANIES.length} companies, ${signalCount} signals, ${contactCount} contacts, ${oppCount} opportunities`);

  return {
    companies: DEMO_COMPANIES.length,
    signals: signalCount,
    contacts: contactCount,
    opportunities: oppCount,
  };
}

export async function resetDemoData(workspaceId: string) {
  console.log("🧹 Resetting demo data for workspace:", workspaceId);
  
  // Due to Cascade deletes, we just need to delete top-level models
  await prisma.company.deleteMany({ where: { workspaceId } });
  await prisma.iCP.deleteMany({ where: { workspaceId } });
  await prisma.offer.deleteMany({ where: { workspaceId } });
  await prisma.sequence.deleteMany({ where: { workspaceId } });
  await prisma.agentRun.deleteMany({ where: { workspaceId } });
  
  return { success: true };
}

function guessSourceType(sourceName: string): string {
  const lower = sourceName.toLowerCase();
  if (lower.includes("linkedin")) return "linkedin";
  if (lower.includes("techcrunch") || lower.includes("wire")) return "news";
  if (lower.includes("website") || lower.includes("company")) return "website";
  if (lower.includes("crunchbase")) return "crunchbase";
  return "web";
}
