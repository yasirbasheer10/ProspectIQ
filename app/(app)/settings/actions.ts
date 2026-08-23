"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireWorkspaceId } from "@/lib/session";
import { revalidatePath } from "next/cache";

/**
 * Both objects arrived here as `Record<string, any>` straight from the browser
 * and went into `String[]` columns unchecked, so a caller could write numbers,
 * nested objects or a 10MB string into any of them. Empty strings are dropped
 * and each list is capped, because these feed the discovery prompt.
 */
const StringList = z.preprocess(
  (value) => (Array.isArray(value) ? value.filter((v) => typeof v === "string" && v.trim() !== "") : []),
  z.array(z.string().trim().min(1).max(200)).max(50)
);

const IcpSchema = z.object({
  geographies: StringList,
  regions: StringList,
  industries: StringList,
  businessModel: StringList,
  technologies: StringList,
  buyerRoles: StringList,
  excludedIndustries: StringList,
  buyingSignals: StringList,
});

const OfferSchema = z.object({
  name: z.string().trim().max(200).optional().default(""),
  description: z.string().trim().max(2000).optional().default(""),
  services: StringList,
  targetProblems: StringList,
  buyerRoles: StringList,
  relevantIndustries: StringList,
});

const SettingsSchema = z.object({
  demoMode: z.boolean(),
  icp: IcpSchema,
  offer: OfferSchema,
});

export async function updateWorkspaceSettings(input: unknown) {
  const workspaceId = await requireWorkspaceId();
  const { demoMode, icp, offer } = SettingsSchema.parse(input);

  // Update workspace demo mode
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { isDemo: demoMode },
  });

  // Upsert ICP
  await prisma.iCP.upsert({
    where: { id: `demo-icp-${workspaceId}` }, // using same ID pattern as seed
    update: icp,
    create: {
      id: `demo-icp-${workspaceId}`,
      name: "Primary ICP",
      workspaceId,
      ...icp,
    },
  });

  // Upsert Offer
  await prisma.offer.upsert({
    where: { id: `demo-offer-${workspaceId}` },
    update: {
      name: offer.name || "Primary Offer",
      description: offer.description,
      services: offer.services,
      targetProblems: offer.targetProblems,
      buyerRoles: offer.buyerRoles,
      relevantIndustries: offer.relevantIndustries,
    },
    create: {
      id: `demo-offer-${workspaceId}`,
      name: offer.name || "Primary Offer",
      description: offer.description,
      workspaceId,
      services: offer.services,
      targetProblems: offer.targetProblems,
      buyerRoles: offer.buyerRoles,
      relevantIndustries: offer.relevantIndustries,
    },
  });

  revalidatePath("/settings");
}
