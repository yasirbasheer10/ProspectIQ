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

  const workspaceId = userWithWorkspaces?.workspaces?.[0]?.workspaceId || "demo";

  return {
    ...session,
    workspaceId,
  };
}

