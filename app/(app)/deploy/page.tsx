import { requireWorkspaceId } from "@/lib/session";
import { DeployAgentClient } from "./DeployAgentClient";

export default async function DeployAgentPage() {
  // Called for its side effect: it throws if there's no session, so the page
  // can't render its form for a signed-out visitor. The workspace itself is
  // read by the server action, not passed through the browser.
  await requireWorkspaceId();

  return <DeployAgentClient />;
}
