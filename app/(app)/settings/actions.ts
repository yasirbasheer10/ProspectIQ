"use server";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

export async function updateWorkspaceSettings({
  demoMode,
  icp,
  offer,
}: {
  demoMode: boolean;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  icp: Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  offer: Record<string, any>;
}) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  // Update workspace demo mode
  await prisma.workspace.update({
    where: { id: session.workspaceId },
    data: { isDemo: demoMode },
  });

  // Upsert ICP
  await prisma.iCP.upsert({
    where: { id: `demo-icp-${session.workspaceId}` }, // using same ID pattern as seed
    update: {
      geographies: icp.geographies,
      regions: icp.regions,
      industries: icp.industries,
      businessModel: icp.businessModel,
      technologies: icp.technologies,
      buyerRoles: icp.buyerRoles,
      excludedIndustries: icp.excludedIndustries,
      buyingSignals: icp.buyingSignals,
    },
    create: {
      id: `demo-icp-${session.workspaceId}`,
      name: "Primary ICP",
      workspaceId: session.workspaceId,
      geographies: icp.geographies,
      regions: icp.regions,
      industries: icp.industries,
      businessModel: icp.businessModel,
      technologies: icp.technologies,
      buyerRoles: icp.buyerRoles,
      excludedIndustries: icp.excludedIndustries,
      buyingSignals: icp.buyingSignals,
    },
  });

  // Upsert Offer
  await prisma.offer.upsert({
    where: { id: `demo-offer-${session.workspaceId}` },
    update: {
      name: offer.name,
      description: offer.description,
      services: offer.services,
      targetProblems: offer.targetProblems,
      buyerRoles: offer.buyerRoles,
      relevantIndustries: offer.relevantIndustries,
    },
    create: {
      id: `demo-offer-${session.workspaceId}`,
      name: offer.name || "Primary Offer",
      description: offer.description,
      workspaceId: session.workspaceId,
      services: offer.services,
      targetProblems: offer.targetProblems,
      buyerRoles: offer.buyerRoles,
      relevantIndustries: offer.relevantIndustries,
    },
  });

  revalidatePath("/settings");
}
