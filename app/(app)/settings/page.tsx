import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  const session = await getSession();
  let workspace = null;
  let icp = null;
  let offer = null;

  if (session) {
    workspace = await prisma.workspace.findUnique({
      where: { id: session.workspaceId },
    });
    icp = await prisma.iCP.findFirst({
      where: { workspaceId: session.workspaceId },
    });
    offer = await prisma.offer.findFirst({
      where: { workspaceId: session.workspaceId },
    });
  }

  return (
    <SettingsClient
      initialDemoMode={workspace?.isDemo ?? true}
      icp={icp}
      offer={offer}
    />
  );
}
