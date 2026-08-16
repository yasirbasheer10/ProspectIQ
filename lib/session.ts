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
    where: { id: (session.user as any).id },
    include: {
      workspaces: {
        take: 1,
      }
    }
  });

  let workspaceId = userWithWorkspaces?.workspaces?.[0]?.workspaceId;

  // Auto-provision a default workspace if they skipped onboarding
  if (!workspaceId) {
    const userId = (session.user as any).id;
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

