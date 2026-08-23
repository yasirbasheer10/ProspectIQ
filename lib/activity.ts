import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

/**
 * The single way to write an `Activity` row.
 *
 * This replaces a variadic helper in `lib/ai/discovery.ts` declared as
 * `logActivity(...args: string[])`, which guessed the caller's intent from
 * `args.length`: four arguments meant the first was a workspace id, three meant
 * it wasn't. Thirteen call sites used both forms — and the workspace id, when
 * passed, was then discarded, because `Activity` had no `workspaceId` column at
 * all. Every activity row therefore belonged to no workspace, the agent-activity
 * page read them all with an unfiltered `findMany`, and "Clear audit log" ran a
 * `deleteMany` with no workspace in its `where` — one workspace clearing its log
 * wiped every other workspace's.
 *
 * `workspaceId` is required here so that can't recur.
 */
export async function logActivity(
  workspaceId: string,
  type: string,
  title: string,
  description?: string,
  extra?: { companyId?: string; conversationId?: string; metadata?: Prisma.InputJsonValue },
) {
  return prisma.activity.create({
    data: {
      workspaceId,
      type,
      title,
      description: description ?? null,
      companyId: extra?.companyId ?? null,
      conversationId: extra?.conversationId ?? null,
      metadata: extra?.metadata,
    },
  });
}
