import { prisma } from "../db";

/**
 * Thrown when a recipient is on the workspace's suppression list. Callers should
 * let this surface — the point is that the send visibly does not happen.
 */
export class SuppressedRecipientError extends Error {
  constructor(
    public readonly matchedType: string,
    public readonly matchedValue: string,
    reason?: string | null,
  ) {
    super(
      `Blocked: ${matchedType} "${matchedValue}" is on this workspace's suppression list` +
      (reason ? ` (${reason}).` : ".")
    );
    this.name = "SuppressedRecipientError";
  }
}

export interface SuppressionTarget {
  email?: string | null;
  /** Company domain. `www.` and casing are normalised before matching. */
  domain?: string | null;
  companyId?: string | null;
}

function normaliseDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

/**
 * Look up whether anything about this recipient is suppressed.
 *
 * The `Suppression` table has existed since the first schema and was read by
 * nothing — there is no outbound send path yet, so no send could consult it.
 * This is written now so that whatever eventually sends has a check to call
 * rather than a check to remember to add.
 *
 * Returns the matching row, or `null` when the recipient is clear.
 */
export async function findSuppression(workspaceId: string, target: SuppressionTarget) {
  const candidates: Array<{ type: string; value: string }> = [];

  if (target.email) {
    const email = target.email.trim().toLowerCase();
    if (email) {
      candidates.push({ type: "email", value: email });
      // An email always implies its own domain, so a domain-level block on
      // `acme.com` must also stop `someone@acme.com`.
      const emailDomain = email.split("@")[1];
      if (emailDomain) candidates.push({ type: "domain", value: normaliseDomain(emailDomain) });
    }
  }

  if (target.domain) {
    const domain = normaliseDomain(target.domain);
    if (domain) candidates.push({ type: "domain", value: domain });
  }

  if (target.companyId) {
    candidates.push({ type: "company_id", value: target.companyId });
  }

  if (candidates.length === 0) return null;

  return await prisma.suppression.findFirst({
    where: { workspaceId, OR: candidates },
    select: { type: true, value: true, reason: true },
  });
}

/**
 * Guard form of {@link findSuppression}. Call this immediately before anything
 * that would contact a recipient.
 */
export async function assertNotSuppressed(workspaceId: string, target: SuppressionTarget) {
  const hit = await findSuppression(workspaceId, target);
  if (hit) {
    throw new SuppressedRecipientError(hit.type, hit.value, hit.reason);
  }
}
