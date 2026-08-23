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
    />
  );
}
