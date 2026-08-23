import { prisma } from "./db";

/**
 * Raised when a record either does not exist or belongs to a different
 * workspace. The message is deliberately identical in both cases — telling a
 * caller "that exists but isn't yours" leaks which IDs are real.
 */
export class RecordNotFoundError extends Error {
  constructor(what: string) {
    super(`That ${what} was not found in your workspace.`);
    this.name = "RecordNotFoundError";
  }
}

/**
 * Ownership guards for server actions.
 *
 * Server actions are publicly callable HTTP endpoints, not private functions.
 * Eight action files used to take a record ID from the browser and act on it
 * with no check at all — `deleteContactAction(id)` would delete any contact in
 * the database. Each guard below re-reads the record scoped to the caller's own
 * workspace, so an ID belonging to someone else behaves exactly like an ID that
 * doesn't exist.
 *
 * Where Prisma allows it, prefer scoping the mutation itself
 * (`updateMany({ where: { id, workspaceId } })`) over calling a guard first —
 * one query instead of two, and no window between the check and the write.
 */

export async function assertCompanyInWorkspace(companyId: string, workspaceId: string) {
  const company = await prisma.company.findFirst({
    where: { id: companyId, workspaceId },
    select: { id: true, name: true, domain: true },
  });
  if (!company) throw new RecordNotFoundError("company");
  return company;
}

export async function assertOpportunityInWorkspace(opportunityId: string, workspaceId: string) {
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: opportunityId, workspaceId },
    select: { id: true, companyId: true },
  });
  if (!opportunity) throw new RecordNotFoundError("opportunity");
  return opportunity;
}

export async function assertContactInWorkspace(contactId: string, workspaceId: string) {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, workspaceId },
    select: { id: true, email: true, companyId: true },
  });
  if (!contact) throw new RecordNotFoundError("contact");
  return contact;
}

/**
 * `OutreachMessage` has no `workspaceId` of its own — it reaches one through
 * either its opportunity or its contact, and both relations are optional.
 */
export async function assertOutreachMessageInWorkspace(messageId: string, workspaceId: string) {
  const message = await prisma.outreachMessage.findFirst({
    where: {
      id: messageId,
      OR: [
        { opportunity: { workspaceId } },
        { contact: { workspaceId } },
      ],
    },
    select: {
      id: true,
      status: true,
      contact: { select: { id: true, email: true } },
      opportunity: { select: { id: true, company: { select: { domain: true, id: true } } } },
    },
  });
  if (!message) throw new RecordNotFoundError("outreach message");
  return message;
}

export async function assertConversationInWorkspace(conversationId: string, workspaceId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId },
    select: { id: true },
  });
  if (!conversation) throw new RecordNotFoundError("conversation");
  return conversation;
}

/** Reaches the workspace through its parent conversation. */
export async function assertConversationMessageInWorkspace(messageId: string, workspaceId: string) {
  const message = await prisma.conversationMessage.findFirst({
    where: { id: messageId, conversation: { workspaceId } },
    select: { id: true, conversationId: true, suggestedReply: true },
  });
  if (!message) throw new RecordNotFoundError("conversation message");
  return message;
}

export async function assertCustomAgentInWorkspace(agentId: string, workspaceId: string) {
  const agent = await prisma.customAgent.findFirst({
    where: { id: agentId, workspaceId },
    select: { id: true },
  });
  if (!agent) throw new RecordNotFoundError("agent");
  return agent;
}
