import { prisma } from "@/lib/db";
import { requireWorkspaceId } from "@/lib/session";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  // Was `if (session) { ... }`, so a signed-out visitor got the settings form
  // with every field blank and a demo-mode toggle defaulted to on.
  const workspaceId = await requireWorkspaceId();

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
  });
  const icp = await prisma.iCP.findFirst({
    where: { workspaceId },
  });
  const offer = await prisma.offer.findFirst({
    where: { workspaceId },
  });

  return (
    <SettingsClient
      initialDemoMode={workspace?.isDemo ?? true}
      icp={icp}
      offer={offer}
      // Nulls become "" here rather than in the client: a controlled <input> with
      // a null value warns and then silently becomes uncontrolled.
      branding={{
        logoUrl: workspace?.logoUrl ?? "",
        brandColor: workspace?.brandColor ?? "",
        senderName: workspace?.senderName ?? "",
        senderTitle: workspace?.senderTitle ?? "",
        senderEmail: workspace?.senderEmail ?? "",
        websiteUrl: workspace?.websiteUrl ?? "",
      }}
    />
  );
}
