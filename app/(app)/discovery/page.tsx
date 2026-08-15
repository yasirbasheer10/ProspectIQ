import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { DiscoveryClient } from "./DiscoveryClient";

export default async function DiscoveryPage() {
  const session = await getSession();
  const workspaceId = session?.workspaceId || "demo";

  const icp = await prisma.iCP.findFirst({
    where: { workspaceId }
  });

  return <DiscoveryClient icp={icp} />;
}
