import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { AgentSettingsClient } from "./AgentSettingsClient";

export default async function AgentSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = await prisma.customAgent.findUnique({
    where: { id },
  });

  if (!agent) {
    redirect("/agents");
  }

  return <AgentSettingsClient agent={agent} />;
}
