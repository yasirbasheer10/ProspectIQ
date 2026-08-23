import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth";
import { prisma } from "./db";

/**
 * Get the current user session from NextAuth.
 * Also attaches the user's primary workspaceId to keep backward compatibility.
 */
export async function getSession() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return null;
  }

  // Fetch the first workspace the user belongs to
  const userWithWorkspaces = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      workspaces: {
        take: 1,
      }
    }
  });

  let workspaceId = userWithWorkspaces?.workspaces?.[0]?.workspaceId;

  // Auto-provision a default workspace if they skipped onboarding
  if (!workspaceId) {
    const userId = session.user.id;
    const defaultWorkspace = await prisma.workspace.create({
      data: {
        name: "My Workspace",
        slug: `workspace-${userId}`,
        members: {
          create: {
            userId: userId,
            role: "owner"
          }
        }
      }
    });
    workspaceId = defaultWorkspace.id;
  }

  return {
    ...session,
    workspaceId,
  };
}

/**
 * Thrown when a caller has no usable session. Server actions and pages should
 * let this propagate — Next renders the nearest `error.tsx` for a page, and a
 * server action returns it to the caller as a rejected promise.
 */
export class NotSignedInError extends Error {
  constructor() {
    super("You are not signed in, or your session has expired. Please sign in again.");
    this.name = "NotSignedInError";
  }
}

/**
 * The only way pages and server actions should obtain a workspace.
 *
 * Every caller used to write `session?.workspaceId || "demo"`, which turned a
 * missing session into queries against a workspace named `"demo"` that does not
 * exist. Those queries succeed and return nothing, so an auth failure rendered
 * as an empty dashboard rather than an error — and any write went to a
 * workspace the user does not own. This throws instead.
 */
export async function requireSession() {
  const session = await getSession();
  if (!session?.user?.id || !session.workspaceId) {
    throw new NotSignedInError();
  }
  // Re-assert workspaceId as non-optional for callers.
  return { ...session, workspaceId: session.workspaceId };
}

export async function requireWorkspace(): Promise<{ userId: string; workspaceId: string }> {
  const session = await requireSession();
  return { userId: session.user.id, workspaceId: session.workspaceId };
}

/** Shorthand for the common case of only needing the workspace. */
export async function requireWorkspaceId(): Promise<string> {
  const { workspaceId } = await requireWorkspace();
  return workspaceId;
}
