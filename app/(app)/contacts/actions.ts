"use server";

import { prisma } from "@/lib/db";
import { requireWorkspaceId } from "@/lib/session";
import { revalidatePath } from "next/cache";

export async function deleteContactAction(id: string) {
  const workspaceId = await requireWorkspaceId();

  // Scope the delete to the caller's workspace rather than checking first —
  // one query, and no window between the check and the write. This action used
  // to delete whatever contact ID it was handed, with no session check at all.
  await prisma.outreachMessage.deleteMany({
    where: { contactId: id, contact: { workspaceId } }
  });

  const { count } = await prisma.contact.deleteMany({
    where: { id, workspaceId }
  });

  if (count === 0) {
    throw new Error("That contact was not found in your workspace.");
  }

  revalidatePath("/contacts");
  revalidatePath("/companies/[id]", "page");
}

export async function deleteBulkContactsAction(ids: string[]) {
  const workspaceId = await requireWorkspaceId();

  if (ids.length === 0) return;

  await prisma.outreachMessage.deleteMany({
    where: { contactId: { in: ids }, contact: { workspaceId } }
  });

  // IDs outside the workspace are silently skipped rather than failing the
  // whole batch — a bulk delete of 20 contacts shouldn't abort because one ID
  // is stale.
  await prisma.contact.deleteMany({
    where: { id: { in: ids }, workspaceId }
  });

  revalidatePath("/contacts");
  revalidatePath("/companies/[id]", "page");
}
