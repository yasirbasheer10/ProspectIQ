import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { ContactsClient } from "./ContactsClient";

export default async function ContactsPage() {
  const session = await getSession();
  const workspaceId = session?.workspaceId || "demo";

  const contacts = await prisma.contact.findMany({
    where: { workspaceId },
    include: {
      company: true,
    },
    orderBy: { createdAt: 'desc' }
  });

  return <ContactsClient contacts={contacts} />;
}
