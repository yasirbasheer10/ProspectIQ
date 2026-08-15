import { getSession } from "@/lib/session";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { prisma } from "@/lib/db";
import { DeployAgentClient } from "./DeployAgentClient";

export default async function DeployAgentPage() {
  const session = await getSession();
  const workspaceId = session?.workspaceId || "demo";
  
  // We'll pass workspaceId to the client to save it in db
  return <DeployAgentClient workspaceId={workspaceId} />;
}
