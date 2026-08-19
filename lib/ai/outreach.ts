import { prisma } from "../db";
import { ai } from "./gemini";

const outreachSchemaDefinition = `
{
  "subject": "A short, intriguing subject line (4-6 words maximum).",
  "body": "The personalized email body. Must be concise, reference genuine evidence, connect to capability, and use low-friction CTA.",
  "personalization_notes": "A 1-sentence explanation of what evidence or problem was used to personalize this message.",
  "evidence_used_ids": ["array", "of", "strings", "matching", "evidence", "IDs"]
}
`;

export async function generateOutreach(opportunityId: string, contactId: string, existingMessageId?: string) {
  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    include: {
      company: {
        include: { evidence: true }
      }
    }
  });

  const contact = await prisma.contact.findUnique({
    where: { id: contactId }
  });

  if (!opportunity || !contact) {
    throw new Error("Missing Opportunity or Contact data");
  }

  const { company } = opportunity;
  const workspaceId = company.workspaceId;

  // Let's create an Agent Run record to log the generation
  const run = await prisma.agentRun.create({
    data: {
      workspaceId,
      type: "DRAFT_OUTREACH",
      status: "RUNNING",
      title: `Generate Outreach for ${contact.fullName}`,
    }
  });

  try {
    const evidenceList = company.evidence.map((e) => `- ID: ${e.id} | ${e.title}: ${e.summary}`).join("\n");

    const prompt = `
You are an elite B2B revenue intelligence AI writing a highly professional, structured outreach proposal.

Company we are pitching to: ${company.name} (${company.domain})
Location/HQ: ${company.headquarters || company.city || "Unknown"}
Recipient: ${contact.fullName} (${contact.title})
Their Problem Statement: ${opportunity.problemStatement}
Why Now trigger: ${opportunity.whyNow}
Our Recommended Service to pitch: ${opportunity.recommendedService}

Available Evidence (Company specific observations):
${evidenceList}

Sender Profile: 
Name: Yasir
Company: ProspectIQ (We offer ${opportunity.recommendedService})

Generate a highly professional, proposal-style email.
It MUST follow these strict rules:
1. Tone: Professional, structured, and authoritative. Frame this as a formal proposal or partnership opportunity rather than a casual cold email.
2. Structure: 
   - Start with a clear observation about their business based on the Available Evidence.
   - If Location/HQ is known (and not "Unknown"), briefly weave it in contextually if possible.
   - Clearly articulate the specific challenge or friction point you have identified (Problem Statement).
   - Propose our solution (${opportunity.recommendedService}) in a structured way (e.g. "We propose...", "Our recommendation is...").
   - Highlight the value or outcome clearly.
3. Length: Keep it under 150 words. Be direct and avoid fluff. Use short paragraphs.
4. CTA: End with a professional call to action to review the proposal or schedule a formal discussion (e.g. "Are you open to reviewing a brief overview of this proposed approach?").
5. Anti-Patterns to avoid:
   - "hope this finds you well", "just bubbling this up", "quick chat"
   - Do not fabricate any stats or information.

You must return valid JSON matching this schema exactly:
${outreachSchemaDefinition}
`;

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
          temperature: 0.7,
        });
        break; // Success, exit retry loop
      } catch (err) {
        retries++;
        console.warn(`Outreach generation attempt ${retries} failed:`, err);
        if (retries >= maxRetries) {
          throw err;
        }
        // Wait before retrying: 1s, then 2s
        await new Promise(resolve => setTimeout(resolve, retries * 1000));
      }
    }

    const text = response?.choices[0].message.content;
    if (!text) throw new Error("Empty response from AI");
    
    const data = JSON.parse(text);

    // Save to database
    let message;
    if (existingMessageId) {
      message = await prisma.outreachMessage.update({
        where: { id: existingMessageId },
        data: {
          subject: data.subject,
          body: data.body,
          personalizationNotes: data.personalization_notes,
          evidenceUsed: data.evidence_used_ids,
          status: "DRAFT"
        }
      });
    } else {
      message = await prisma.outreachMessage.create({
        data: {
          opportunityId,
          contactId,
          subject: data.subject,
          body: data.body,
          personalizationNotes: data.personalization_notes,
          evidenceUsed: data.evidence_used_ids,
          status: "DRAFT",
          channel: "EMAIL"
        }
      });
    }

    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "COMPLETED", resultSummary: "Message generated." }
    });

    return message;

  } catch (error: unknown) {
    console.error("Outreach Generation Error (Exhausted retries):", error);
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "FAILED", errorMessage: error instanceof Error ? error.message : String(error) }
    });
    
    // Provide a safe, honest template instead of a hallucination
    return await fallbackToSafeTemplate(opportunityId, contactId, company, opportunity, contact, existingMessageId);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fallbackToSafeTemplate(opportunityId: string, contactId: string, company: any, opportunity: any, contact: any, existingMessageId?: string) {
  const firstName = contact.firstName || contact.fullName?.split(" ")[0] || "there";
  const service = opportunity.recommendedService || "our solutions";
  
  const subject = `Partnership opportunity with ${company.name}`;
  const body = `Hi ${firstName},\n\nI noticed ${company.name} recently [Insert observation about their recent growth, news, or pain point].\n\nTypically, when companies like yours experience this, they face challenges with [Insert typical problem related to observation]. We specialize in identifying and resolving these exact bottlenecks through ${service}.\n\nWould you be open to a brief overview of a proposed approach tailored to your team?\n\nBest,\nYasir`;
  
  const personalizationNotes = "⚠️ AI Generation Failed. This is a generic safe template. Please manually replace the [Bracketed] placeholders before sending.";
  const evidenceUsedIds = company.evidence?.[0] ? [company.evidence[0].id] : [];
  
  if (existingMessageId) {
    return await prisma.outreachMessage.update({
      where: { id: existingMessageId },
      data: {
        subject,
        body,
        personalizationNotes,
        evidenceUsed: evidenceUsedIds,
        status: "DRAFT"
      }
    });
  } else {
    return await prisma.outreachMessage.create({
      data: {
        opportunityId,
        contactId,
        subject,
        body,
        personalizationNotes,
        evidenceUsed: evidenceUsedIds,
        status: "DRAFT",
        channel: "EMAIL"
      }
    });
  }
}
