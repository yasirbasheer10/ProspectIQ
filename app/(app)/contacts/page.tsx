import { prisma } from "@/lib/db";
import { requireWorkspaceId } from "@/lib/session";
import { ContactsClient } from "./ContactsClient";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string };
}) {
  const workspaceId = await requireWorkspaceId();

  const q = searchParams?.q || "";
  const page = parseInt(searchParams?.page || "1");
  const pageSize = 50;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const whereClause: any = {
    workspaceId,
  };

  if (q) {
    whereClause.OR = [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { title: { contains: q, mode: "insensitive" } },
      { company: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [contacts, totalItems] = await Promise.all([
    prisma.contact.findMany({
      where: whereClause,
      include: {
        company: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.contact.count({ where: whereClause }),
  ]);

  const totalPages = Math.ceil(totalItems / pageSize);

  return (
    <ContactsClient 
      contacts={contacts} 
      totalItems={totalItems} 
      totalPages={totalPages} 
      currentPage={page} 
      searchQueryParam={q}
    />
  );
}
