import { Topbar } from "@/components/layout/Topbar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { GitBranch, Plus, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export default async function SequencesPage() {
  const session = await getSession();
  const workspaceId = session?.workspaceId || "demo";

  const sequences = await prisma.sequence.findMany({
    where: { workspaceId },
    include: { steps: true },
    orderBy: { createdAt: 'desc' }
  });

  return (
    <div className="flex h-full flex-col bg-white">
      <Topbar 
        title="Sequences" 
        actions={sequences.length > 0 ? <Button variant="primary" size="sm" icon={Plus}>Create Sequence</Button> : undefined}
      />
      <main className="flex-1 overflow-y-auto p-8 bg-[#F5F5F7]">
        {sequences.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <EmptyState
              icon={GitBranch}
              title="No Active Sequences"
              description="Build multi-touch outreach sequences to engage your prospects across different channels."
              action={<Button variant="primary" icon={Plus}>Create Sequence</Button>}
            />
          </div>
        ) : (
          <div className="mx-auto max-w-5xl space-y-4">
            {sequences.map(seq => (
              <Card key={seq.id} className="p-6 flex items-center justify-between hover:shadow-apple-md transition-shadow group cursor-pointer">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-[15px] font-medium text-[#1D1D1F]">{seq.name}</h3>
                    <Badge variant={seq.status === "ACTIVE" ? "success" : "default"}>
                      {seq.status === "ACTIVE" ? "Active" : "Draft"}
                    </Badge>
                  </div>
                  <p className="text-[13px] text-[#86868B]">{seq.description}</p>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-[11px] font-medium text-[#86868B] uppercase tracking-widest mb-1">Steps</p>
                    <p className="text-[14px] font-medium text-[#1D1D1F]">{seq.steps?.length || 0}</p>
                  </div>
                  <ChevronRight size={16} className="text-[#86868B] opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
