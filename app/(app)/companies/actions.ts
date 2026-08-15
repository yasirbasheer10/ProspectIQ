"use server";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

export async function deleteCompany(companyId: string) {
  const session = await getSession();
  const workspaceId = session?.workspaceId || "demo";

  try {
    // We only delete if it belongs to the current workspace
    await prisma.company.deleteMany({
      where: {
        id: companyId,
        workspaceId,
      }
    });

    revalidatePath("/companies");
    return { success: true };
  } catch (error) {
    console.error("Failed to delete company:", error);
    return { success: false, error: "Failed to delete company" };
  }
}

export async function bulkDeleteCompanies(companyIds: string[]) {
  const session = await getSession();
  const workspaceId = session?.workspaceId || "demo";

  try {
    await prisma.company.deleteMany({
      where: {
        id: { in: companyIds },
        workspaceId,
      }
    });

    revalidatePath("/companies");
    return { success: true };
  } catch (error) {
    console.error("Failed to bulk delete companies:", error);
    return { success: false, error: "Failed to bulk delete companies" };
  }
}
