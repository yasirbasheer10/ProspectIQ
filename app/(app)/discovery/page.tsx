import { prisma } from "@/lib/db";
import { requireWorkspaceId } from "@/lib/session";
import { DiscoveryClient } from "./DiscoveryClient";

export default async function DiscoveryPage() {
  const workspaceId = await requireWorkspaceId();

  const icp = await prisma.iCP.findFirst({
    where: { workspaceId }
  });

  return <DiscoveryClient icp={icp} />;
}
