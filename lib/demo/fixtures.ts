/**
 * Demo Fixtures
 * 
 * Synthetic data for demonstrating the full workflow without external APIs.
 * All companies, people, and data below are FICTIONAL and clearly labeled.
 * No real companies, emails, or personal data is fabricated here.
 */

// String literal types matching Prisma enums (no generated client dependency)
type CompanyStatus = "DISCOVERED" | "RESEARCHING" | "RESEARCHED" | "QUALIFIED" | "DISQUALIFIED" | "IN_OUTREACH" | "CONVERTED" | "SUPPRESSED";
type OpportunityStatus = "NEW" | "REVIEWING" | "APPROVED" | "REJECTED" | "IN_OUTREACH" | "CONVERTED" | "LOST";
type SignalType = "HIRING" | "FUNDING" | "PRODUCT_LAUNCH" | "LEADERSHIP_CHANGE" | "EXPANSION" | "TECHNOLOGY_CHANGE" | "PAIN_POINT" | "COMPETITOR_MENTION" | "REGULATORY" | "PARTNERSHIP" | "AWARD" | "PRESS_MENTION" | "JOB_POSTING";
type AgentRunType = "DISCOVERY" | "RESEARCH" | "SCORING" | "OUTREACH_GENERATION" | "REPLY_CLASSIFICATION" | "FOLLOW_UP_GENERATION" | "DEMO_SEED";
type AgentRunStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";


export interface DemoCompany {
  id: string;
  name: string;
  domain: string;
  website: string;
  description: string;
  industry: string;
  employeeRange: string;
  employeeCount: number;
  revenueRange: string;
  headquarters: string;
  country: string;
  technologies: string[];
  status: CompanyStatus;
  discoverySource: string;
}

export interface DemoSignal {
  companyName: string;
  type: SignalType;
  title: string;
  description: string;
  sourceUrl: string;
  sourceName: string;
  relevance: number;
}

export interface DemoContact {
  companyName: string;
  fullName: string;
  firstName: string;
  lastName: string;
  title: string;
  seniority: string;
  department: string;
  linkedinUrl: string;
  email: string;
  sourceUrl: string;
  sourceName: string;
  buyerScore: number;
}

// ─── Demo Companies ────────────────────────────────────────
// All fictional. Clearly marked with [DEMO] prefix in descriptions.

export const DEMO_COMPANIES: DemoCompany[] = [
  {
    id: "demo-1",
    name: "Nexivus Technologies",
    domain: "nexivus.io",
    website: "https://nexivus.io",
    description: "[DEMO] B2B SaaS company providing supply chain visibility software for mid-market manufacturers.",
    industry: "Software",
    employeeRange: "51-200",
    employeeCount: 120,
    revenueRange: "$5M-$20M",
    headquarters: "Austin, TX",
    country: "United States",
    technologies: ["Salesforce", "HubSpot", "AWS", "React"],
    status: "RESEARCHED" as CompanyStatus,
    discoverySource: "demo",
  },
  {
    id: "demo-2",
    name: "Vertalo Group",
    domain: "vertalogroup.com",
    website: "https://vertalogroup.com",
    description: "[DEMO] Digital marketing agency specializing in demand generation for B2B technology companies.",
    industry: "Marketing Services",
    employeeRange: "11-50",
    employeeCount: 38,
    revenueRange: "$2M-$5M",
    headquarters: "London, UK",
    country: "United Kingdom",
    technologies: ["HubSpot", "Google Analytics", "Webflow", "Slack"],
    status: "QUALIFIED" as CompanyStatus,
    discoverySource: "demo",
  },
  {
    id: "demo-3",
    name: "Qora Analytics",
    domain: "qora.ai",
    website: "https://qora.ai",
    description: "[DEMO] AI-powered analytics platform for e-commerce operations teams.",
    industry: "Software",
    employeeRange: "11-50",
    employeeCount: 25,
    revenueRange: "$1M-$5M",
    headquarters: "Berlin, Germany",
    country: "Germany",
    technologies: ["Python", "Snowflake", "dbt", "Looker"],
    status: "IN_OUTREACH" as CompanyStatus,
    discoverySource: "demo",
  },
  {
    id: "demo-4",
    name: "Brandfield Commerce",
    domain: "brandfield.co",
    website: "https://brandfield.co",
    description: "[DEMO] D2C brand aggregator managing 8 consumer brands across wellness and lifestyle verticals.",
    industry: "E-commerce",
    employeeRange: "51-200",
    employeeCount: 85,
    revenueRange: "$10M-$50M",
    headquarters: "Miami, FL",
    country: "United States",
    technologies: ["Shopify", "Klaviyo", "Triple Whale", "Gorgias"],
    status: "DISCOVERED" as CompanyStatus,
    discoverySource: "demo",
  },
  {
    id: "demo-5",
    name: "Celeris Logistics",
    domain: "celeris.io",
    website: "https://celeris.io",
    description: "[DEMO] Last-mile delivery technology company serving regional courier networks.",
    industry: "Logistics & Transportation",
    employeeRange: "201-500",
    employeeCount: 310,
    revenueRange: "$20M-$100M",
    headquarters: "Chicago, IL",
    country: "United States",
    technologies: ["Oracle", "Salesforce", "Azure", "Power BI"],
    status: "DISCOVERED" as CompanyStatus,
    discoverySource: "demo",
  },
  {
    id: "demo-6",
    name: "Nova Health Systems",
    domain: "novahealth.io",
    website: "https://novahealth.io",
    description: "[DEMO] Digital health platform for patient intake and scheduling.",
    industry: "Healthcare IT",
    employeeRange: "51-200",
    employeeCount: 145,
    revenueRange: "$10M-$50M",
    headquarters: "Boston, MA",
    country: "United States",
    technologies: ["Salesforce", "Epic", "React"],
    status: "DISCOVERED" as CompanyStatus,
    discoverySource: "demo",
  },
  {
    id: "demo-7",
    name: "Alpine Fintech",
    domain: "alpinefintech.com",
    website: "https://alpinefintech.com",
    description: "[DEMO] B2B payment processing solutions for mid-market retailers.",
    industry: "Financial Services",
    employeeRange: "201-500",
    employeeCount: 280,
    revenueRange: "$50M-$100M",
    headquarters: "Denver, CO",
    country: "United States",
    technologies: ["Stripe", "AWS", "Java"],
    status: "DISCOVERED" as CompanyStatus,
    discoverySource: "demo",
  },
];

// ─── Demo Signals ──────────────────────────────────────────

export const DEMO_SIGNALS: DemoSignal[] = [
  {
    companyName: "Nexivus Technologies",
    type: "HIRING" as SignalType,
    title: "Hiring: 3 Senior Account Executive roles",
    description: "Nexivus posted 3 Senior AE positions on LinkedIn in the past 30 days, indicating a push to scale their sales motion.",
    sourceUrl: "https://linkedin.com/jobs/nexivus-demo",
    sourceName: "LinkedIn Jobs",
    relevance: 0.9,
  },
  {
    companyName: "Nexivus Technologies",
    type: "FUNDING" as SignalType,
    title: "Series B: $14M raised",
    description: "Nexivus Technologies announced a $14M Series B led by Insight Partners to accelerate go-to-market expansion.",
    sourceUrl: "https://techcrunch.com/demo/nexivus-series-b",
    sourceName: "TechCrunch",
    relevance: 0.95,
  },
  {
    companyName: "Vertalo Group",
    type: "LEADERSHIP_CHANGE" as SignalType,
    title: "New VP of Sales hired from Salesforce",
    description: "Vertalo Group announced the appointment of Marcus Chen as VP of Sales, joining from Salesforce where he led EMEA partnerships.",
    sourceUrl: "https://linkedin.com/in/marcus-chen-demo",
    sourceName: "LinkedIn",
    relevance: 0.85,
  },
  {
    companyName: "Qora Analytics",
    type: "TECHNOLOGY_CHANGE" as SignalType,
    title: "Migrating CRM from Pipedrive to HubSpot",
    description: "Qora Analytics' Head of Revenue Ops posted about their HubSpot implementation challenges, seeking advice on data migration.",
    sourceUrl: "https://linkedin.com/posts/demo-qora",
    sourceName: "LinkedIn",
    relevance: 0.8,
  },
  {
    companyName: "Brandfield Commerce",
    type: "EXPANSION" as SignalType,
    title: "Acquiring 2 new D2C brands",
    description: "Brandfield Commerce announced plans to acquire two UK-based wellness brands, expanding their portfolio to 10 brands.",
    sourceUrl: "https://businesswire.com/demo/brandfield",
    sourceName: "Business Wire",
    relevance: 0.88,
  },
];

// ─── Demo Contacts ─────────────────────────────────────────

export const DEMO_CONTACTS: DemoContact[] = [
  {
    companyName: "Nexivus Technologies",
    fullName: "Sarah Okonkwo",
    firstName: "Sarah",
    lastName: "Okonkwo",
    title: "VP of Revenue",
    seniority: "VP",
    department: "Sales",
    linkedinUrl: "https://linkedin.com/in/sarah-okonkwo-demo",
    email: "sarah.okonkwo@nexivus.io",
    sourceUrl: "https://linkedin.com/company/nexivus/people",
    sourceName: "LinkedIn",
    buyerScore: 92,
  },
  {
    companyName: "Vertalo Group",
    fullName: "Marcus Chen",
    firstName: "Marcus",
    lastName: "Chen",
    title: "VP of Sales",
    seniority: "VP",
    department: "Sales",
    linkedinUrl: "https://linkedin.com/in/marcus-chen-demo",
    email: "m.chen@vertalogroup.com",
    sourceUrl: "https://linkedin.com/company/vertalo/people",
    sourceName: "LinkedIn",
    buyerScore: 88,
  },
  {
    companyName: "Qora Analytics",
    fullName: "Lena Fischer",
    firstName: "Lena",
    lastName: "Fischer",
    title: "Head of Revenue Operations",
    seniority: "Director",
    department: "Revenue Operations",
    linkedinUrl: "https://linkedin.com/in/lena-fischer-demo",
    email: "lena@qora.ai",
    sourceUrl: "https://qora.ai/team",
    sourceName: "Company Website",
    buyerScore: 85,
  },
];

// ─── Demo ICP ──────────────────────────────────────────────

export const DEMO_ICP = {
  name: "B2B SaaS Growth Stage (Demo)",
  description: "[DEMO] Series A-C B2B SaaS companies with 20-500 employees experiencing scaling pains in their revenue operations.",
  industries: ["Software", "SaaS", "Technology"],
  companySizeMin: 20,
  companySizeMax: 500,
  geographies: ["United States", "United Kingdom", "Germany", "Canada", "Australia"],
  regions: ["North America", "EMEA"],
  technologies: ["Salesforce", "HubSpot", "Outreach", "Gong"],
  businessModel: ["B2B", "Subscription"],
  buyingSignals: ["hiring sales", "series a", "series b", "new vp sales", "scaling revenue", "outbound"],
  excludeKeywords: ["competitor", "do not contact"],
  excludedIndustries: ["B2C", "E-commerce"],
  buyerRoles: ["VP of Sales", "VP of Revenue", "CRO"],
};

// ─── Demo Offer ────────────────────────────────────────────

export const DEMO_OFFER = {
  name: "AI Revenue Agent Platform (Demo)",
  description: "[DEMO] We help B2B companies build a systematic, evidence-driven pipeline using AI-powered research and personalized outreach.",
  valueProposition: "Replace spray-and-pray outreach with precision targeting. We identify the right companies, the right problem, the right buyer — and generate outreach backed by real evidence.",
  services: ["Outbound Strategy", "AI Implementation", "Sales Coaching"],
  targetProblems: [
    "Low outbound reply rates",
    "Slow pipeline velocity",
    "Inability to scale personalized outreach",
    "Poor lead quality from generic lists",
    "No systematic follow-up process",
  ],
  differentiators: [
    "Evidence-first approach — every message is backed by research",
    "AI finds the buying signal before you reach out",
    "Human approval at every step",
    "Full audit trail of all AI decisions",
  ],
  buyerRoles: ["VP of Sales", "VP of Revenue", "CRO"],
  relevantIndustries: ["Software", "SaaS", "Technology"],
};

// ─── Demo Opportunities ────────────────────────────────────

export const DEMO_OPPORTUNITIES = [
  {
    companyName: "Nexivus Technologies",
    problemStatement: "Nexivus is rapidly scaling their sales team (3 AE hires) following a $14M Series B but lacks the systematic outbound infrastructure to support that growth. Their current processes are manual and won't scale.",
    whyNow: "Fresh funding + aggressive hiring = budget + urgency. The new sales hires will feel the pain of poor tooling immediately.",
    opportunitySummary: "Strong opportunity: post-Series B growth mode with clear scaling pain. Decision maker (VP Revenue) is active on LinkedIn and likely evaluating solutions.",
    icpFitScore: 88,
    problemEvidenceScore: 82,
    buyingIntentScore: 76,
    serviceMatchScore: 90,
    buyerConfidenceScore: 85,
    contactabilityScore: 78,
    overallScore: 83.4,
    recommendedService: "Full Platform + Onboarding",
    recommendedBuyerRole: "VP of Revenue",
    recommendedChannel: "EMAIL",
    status: "APPROVED" as OpportunityStatus,
  },
  {
    companyName: "Vertalo Group",
    problemStatement: "Vertalo has a new VP of Sales who likely wants to make an immediate impact by improving pipeline quality. The agency model makes systematic outreach essential but historically difficult.",
    whyNow: "New leadership = new budget decisions in first 90 days. Classic '90-day window' for new tool adoption.",
    opportunitySummary: "Good opportunity: new VP means fresh ears and budget authority. Need to move quickly before they settle on existing tools.",
    icpFitScore: 72,
    problemEvidenceScore: 65,
    buyingIntentScore: 80,
    serviceMatchScore: 75,
    buyerConfidenceScore: 88,
    contactabilityScore: 82,
    overallScore: 74.9,
    recommendedService: "Starter Package",
    recommendedBuyerRole: "VP of Sales",
    recommendedChannel: "EMAIL",
    status: "NEW" as OpportunityStatus,
  },
];

// ─── Demo Agent Runs ───────────────────────────────────────

export const DEMO_AGENT_RUNS = [
  {
    type: "DEMO_SEED" as AgentRunType,
    status: "COMPLETED" as AgentRunStatus,
    title: "Demo Data Seeded",
    description: "Loaded 5 demo companies, 5 signals, 3 contacts, 2 opportunities",
    totalItems: 5,
    processedItems: 5,
    resultSummary: "Successfully seeded all demo data",
  },
];

// ─── Demo Sequences ───────────────────────────────────────

export const DEMO_SEQUENCES = [
  {
    id: "demo-seq-1",
    name: "Q3 VP Sales Outbound (Demo)",
    description: "Automated sequence targeting VP of Sales at Series B+ SaaS companies.",
    status: "ACTIVE",
    stats: {
      enrolled: 42,
      active: 18,
      replied: 6,
      meetings: 2,
      bounced: 1,
    }
  }
];

// ─── Demo Outreach (Emails) ───────────────────────────────

export const DEMO_OUTREACH = [
  {
    companyName: "Nexivus Technologies",
    contactEmail: "sarah.okonkwo@nexivus.io",
    subject: "Scaling your team post-Series B",
    body: "Hi Sarah,\n\nSaw the news on your $14M Series B led by Insight Partners—huge congratulations!\n\nI noticed you're currently hiring for 3 Senior AEs. As you scale the team, maintaining high-quality outbound usually becomes a bottleneck. We help B2B SaaS companies use AI to research and generate highly personalized outreach at scale.\n\nAre you open to a quick chat next week to see how this could accelerate your new hires' ramp time?\n\nBest,\nAlex",
    status: "APPROVED",
    type: "EMAIL",
    sequenceId: "demo-seq-1",
  },
  {
    companyName: "Qora Analytics",
    contactEmail: "lena@qora.ai",
    subject: "Thoughts on HubSpot migration?",
    body: "Hi Lena,\n\nSaw your post about the challenges migrating from Pipedrive to HubSpot. It's a notoriously tricky transition, especially ensuring your historical activity data maps correctly.\n\nWhile we don't do migrations directly, our platform integrates deeply with HubSpot to automate the outbound motion your team is likely trying to build out post-migration.\n\nWorth a brief chat once the dust settles on the CRM move?\n\nThanks,\nAlex",
    status: "DRAFT",
    type: "LINKEDIN",
  }
];

// ─── Demo Conversations & Replies ────────────────────────

export const DEMO_CONVERSATIONS = [
  {
    companyName: "Vertalo Group",
    contactEmail: "m.chen@vertalogroup.com",
    status: "ACTIVE",
    messages: [
      {
        direction: "OUTBOUND",
        body: "Hi Marcus,\n\nCongrats on the new role at Vertalo! Coming from Salesforce, you know how critical a clean, evidence-based pipeline is. Are you currently evaluating tools to systematize your outbound engine here?",
        createdAt: new Date(Date.now() - 86400000 * 2), // 2 days ago
      },
      {
        direction: "INBOUND",
        body: "Hi Alex,\n\nThanks. We are actually looking at a few options right now to get our reps off manual prospecting. Can you send over some pricing or a brief demo video before we jump on a call?\n\nBest,\nMarcus",
        createdAt: new Date(Date.now() - 86400000 * 1), // 1 day ago
        intent: "INTERESTED",
        suggestedResponse: "Hi Marcus, absolutely. Here is a 3-minute demo video covering our core workflow: [Link]. Our pricing starts at $1,500/mo for 5 seats. Let me know if you'd like to dive deeper on a call later this week.",
      }
    ]
  }
];

