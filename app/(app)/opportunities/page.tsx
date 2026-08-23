import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Filter, ChevronRight, User, Briefcase, Zap, Building } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireWorkspaceId } from "@/lib/session";

export default async function OpportunitiesPage() {
  const workspaceId = await requireWorkspaceId();

  const opportunities = await prisma.opportunity.findMany({
    where: { workspaceId },
    include: {
      company: true,
      score: true
    },
    orderBy: { createdAt: 'desc' }
  });

  return (
    <div className="flex h-full flex-col bg-white">
      <Topbar
        title="Opportunities"
        actions={
          <Button variant="secondary" size="sm" icon={Filter}>Filter</Button>
        }
      />

      <main className="flex-1 overflow-y-auto p-8 bg-[#F5F5F7]">
        <div className="mx-auto max-w-6xl space-y-6">
          
          {opportunities.length > 0 ? opportunities.map((opp) => {
            const company = opp.company;
            const scoreObj = opp.score;
            const overallScore = scoreObj ? scoreObj.overallScore || 70 : 70;
            const isHighConfidence = overallScore > 80;

            return (
              <Card key={opp.id} className="p-8 hover:shadow-apple-md transition-shadow">
                <div className="flex flex-col md:flex-row gap-8">
                  
                  {/* Left Column: Core Info */}
                  <div className="md:w-1/3 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-[#F5F5F7] border border-[#E5E5EA]">
                          <Building size={14} className="text-[#4B5563]" />
                        </div>
                        <h3 className="text-xl font-medium text-[#1D1D1F]">{company?.name || 'Unknown Company'}</h3>
                      </div>
                      <p className="text-[14px] font-medium text-[#0071E3] mb-6">{opp.opportunitySummary || "Strategic Opportunity"}</p>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[11px] font-medium text-[#86868B] uppercase tracking-wider mb-1">Score</p>
                          <p className="text-3xl font-semibold tracking-tight text-[#1D1D1F]">{Math.round(overallScore)}</p>
                        </div>
                        <div>
                          <p className="text-[11px] font-medium text-[#86868B] uppercase tracking-wider mb-2">Confidence</p>
                          <Badge variant={isHighConfidence ? "info" : "warning"} className="px-3 py-1">
                            {isHighConfidence ? "High" : "Medium"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-8">
                      <Link href={`/companies/${company.id}`}>
                        <Button variant="outline" size="md" className="w-full" iconRight={ChevronRight}>View Details</Button>
                      </Link>
                    </div>
                  </div>
                  
                  {/* Right Column: Details */}
                  <div className="md:w-2/3 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-6">
                      <div>
                        <h4 className="flex items-center gap-2 text-[13px] font-semibold text-[#1D1D1F] mb-2">
                          <Zap size={14} className="text-[#FF9500]" /> Problem
                        </h4>
                        <p className="text-[13px] leading-relaxed text-[#4B5563]">{opp.problemStatement}</p>
                      </div>
                      <div>
                        <h4 className="text-[13px] font-semibold text-[#1D1D1F] mb-2">Why now</h4>
                        <p className="text-[13px] leading-relaxed text-[#4B5563]">{opp.whyNow}</p>
                      </div>
                    </div>
                    
                    <div className="space-y-6 border-l border-[#E5E5EA] pl-6">
                      <div>
                        <h4 className="flex items-center gap-2 text-[13px] font-semibold text-[#1D1D1F] mb-2">
                          <User size={14} className="text-[#0071E3]" /> Buyer
                        </h4>
                        <p className="text-[13px] text-[#4B5563]">{opp.recommendedBuyerRole}</p>
                      </div>
                      <div>
                        <h4 className="flex items-center gap-2 text-[13px] font-semibold text-[#1D1D1F] mb-2">
                          <Briefcase size={14} className="text-[#34C759]" /> Recommended Service
                        </h4>
                        <p className="text-[13px] text-[#4B5563]">{opp.recommendedService}</p>
                      </div>
                    </div>
                  </div>

                </div>
              </Card>
            );
          }) : (
            <div className="text-center py-12 text-[#86868B]">
              No opportunities found.
            </div>
          )}
          
        </div>
      </main>
    </div>
  );
}
