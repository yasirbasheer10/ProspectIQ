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

/**
 * The agency's letterhead.
 *
 * A separate action with its own save button rather than another branch of
 * `SettingsSchema`, because these fields have nothing to do with the ICP or the
 * offer and an agency should not have to get the discovery form right before it
 * can put its logo on an audit.
 *
 * Everything here ends up on a page the agency's prospect opens, so each field is
 * validated at write time rather than trusted and patched over at render time.
 */
const BrandingSchema = z.object({
  logoUrl: z
    .string()
    .trim()
    .max(2000)
    // http(s) only. A logo URL is interpolated into `<img src>` on a public page,
    // so `javascript:`, `data:` and friends are refused outright rather than
    // sanitised — there is no legitimate logo that needs them.
    .refine((v) => v === "" || /^https:\/\/|^http:\/\//i.test(v), {
      message: "The logo URL needs to start with https://",
    })
    .optional()
    .default(""),
  brandColor: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || /^#(?:[0-9A-F]{3}|[0-9A-F]{6})$/.test(v), {
      message: "Use a hex colour like #0071E3.",
    })
    .optional()
    .default(""),
  senderName: z.string().trim().max(120).optional().default(""),
  senderTitle: z.string().trim().max(120).optional().default(""),
  senderEmail: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: "That does not look like an email address.",
    })
    .optional()
    .default(""),
  websiteUrl: z.string().trim().max(2000).optional().default(""),
});

export async function updateAuditBranding(input: unknown) {
  const workspaceId = await requireWorkspaceId();
  const data = BrandingSchema.parse(input);

  // Empty strings become null. A blank field means "I have not set this", and the
  // audit renderer already skips null — storing "" instead would render an empty
  // signature line on a document a prospect reads.
  const blankToNull = (v: string) => (v === "" ? null : v);

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      logoUrl: blankToNull(data.logoUrl),
      brandColor: blankToNull(data.brandColor),
      senderName: blankToNull(data.senderName),
      senderTitle: blankToNull(data.senderTitle),
      senderEmail: blankToNull(data.senderEmail),
      websiteUrl: blankToNull(data.websiteUrl),
    },
  });

  revalidatePath("/settings");
}
