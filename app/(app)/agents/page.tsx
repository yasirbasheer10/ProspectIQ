// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { AgentFleetClient } from "./AgentFleetClient";

import { requireWorkspaceId } from "@/lib/session";

export default async function AgentsPage() {
  const workspaceId = await requireWorkspaceId();

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
