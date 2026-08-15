import { PrismaClient } from "@prisma/client";
import { researchCompany } from "./lib/ai/intelligence";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting Intelligence Engine Test...");

  // 1. Setup mock workspace
  let workspace = await prisma.workspace.findFirst({ where: { slug: "demo-test" } });
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: { name: "Demo Test Workspace", slug: "demo-test" }
    });
  }

  // 2. Setup mock company
  let company = await prisma.company.findFirst({
    where: { workspaceId: workspace.id, domain: "stripe.com" }
  });

  if (!company) {
    company = await prisma.company.create({
      data: {
        workspaceId: workspace.id,
        name: "Stripe",
        domain: "stripe.com",
        status: "DISCOVERED"
      }
    });
  } else {
    // reset status
    await prisma.company.update({
      where: { id: company.id },
      data: { status: "DISCOVERED" }
    });
  }

  console.log(`Using test company: ${company.name} (${company.id})`);

  // 3. Run Intelligence Engine
  console.log("Running researchCompany()...");
  const result = await researchCompany({ companyId: company.id, workspaceId: workspace.id });
  
  console.log("\n--- RESULT ---");
  console.log(JSON.stringify(result, null, 2));

  // 4. Check AgentRun
  const run = await prisma.agentRun.findFirst({
    where: { workspaceId: workspace.id, type: "RESEARCH" },
    orderBy: { createdAt: "desc" }
  });

  console.log("\n--- AGENT RUN TRACE ---");
  console.log(JSON.stringify(run, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
