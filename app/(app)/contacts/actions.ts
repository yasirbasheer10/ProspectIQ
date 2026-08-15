"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function deleteContactAction(id: string) {
  // First delete any dependent outreach messages
  await prisma.outreachMessage.deleteMany({
    where: { contactId: id }
  });

  // Then delete the contact
  await prisma.contact.delete({
    where: { id }
  });

  revalidatePath("/contacts");
  revalidatePath("/companies/[id]", "page");
}
export async function deleteBulkContactsAction(ids: string[]) {
  await prisma.outreachMessage.deleteMany({
    where: { contactId: { in: ids } }
  });

  await prisma.contact.deleteMany({
    where: { id: { in: ids } }
  });

  revalidatePath("/contacts");
  revalidatePath("/companies/[id]", "page");
}
