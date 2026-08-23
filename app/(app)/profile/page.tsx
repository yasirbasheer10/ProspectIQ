import { requireWorkspace } from "@/lib/session";
import { prisma } from "@/lib/db";
import { ProfileClient } from "./ProfileClient";

export default async function ProfilePage() {
  // This page used to call `getSession()`, throw the result away, and then load
  // `user.findFirst({ where: { isDemo: true } })` — creating demo@example.com if
  // no demo user existed. So everyone saw and edited the same shared record.
  // `updateUserProfile` now writes to the session's own user, so the form has to
  // be populated from that same user or it would display one and save the other.
  const { userId } = await requireWorkspace();

  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    // The session referenced a user row that no longer exists.
    throw new Error("Your user account could not be found. Please sign in again.");
  }

  return <ProfileClient user={user} />;
}
