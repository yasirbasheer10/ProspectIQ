// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { AgentFleetClient } from "./AgentFleetClient";

import { getSession } from "@/lib/session";

export default async function AgentsPage() {
  const session = await getSession();
  const workspaceId = session?.workspaceId || "demo";

  const agents = await prisma.customAgent.findMany({
    where: { workspaceId },
    include: {
      _count: {
        select: {
          companies: true,
          contacts: true,
          outreachMessages: true,
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  return <AgentFleetClient agents={agents} />;
}
