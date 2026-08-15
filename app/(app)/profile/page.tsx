import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { ProfileClient } from "./ProfileClient";

export default async function ProfilePage() {
  await getSession();
  
  // Since we don't have a full auth system, we'll fetch the first demo user, or just mock it if not found
  let user = await prisma.user.findFirst({
    where: { isDemo: true }
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: "demo@example.com",
        name: "Demo User",
        isDemo: true
      }
    });
  }
  
  return <ProfileClient user={user} />;
}
