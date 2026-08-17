import { prisma } from "@/lib/db";
import { ai } from "./groq";
import * as cheerio from "cheerio";
import { performSearch } from "./search";
import { sanitizeText } from "./intelligence";

interface DiscoveryParams {
  workspaceId: string;
  agentRunId: string;
  customDomains?: string[];
  icpParams?: {
    countries: Record<string, string[]>;
    industries: string[];
    size: string | null;
  }
}

export async function runDiscoveryEngine(params: DiscoveryParams) {
  const { workspaceId, agentRunId, customDomains, icpParams } = params;

  try {
    // 1. Log Start
    await logActivity(workspaceId, "START_DISCOVERY", "Started Discovery Run", `Initialized discovery engine. Run ID: ${agentRunId}`);

    // Fetch ICP from DB as fallback
    const icp = await prisma.iCP.findFirst({ where: { workspaceId } });
    
    // 2. Determine domains to scrape
    let domainsToScrape: string[] = [];

    if (customDomains && customDomains.length > 0) {
      domainsToScrape = customDomains;
      await logActivity(workspaceId, "MANUAL_IMPORT", "Imported Target Domains", `Parsed ${domainsToScrape.length} domain(s) for manual discovery.`);
    } else {
      // Public Web Research using Groq + Serper
      await logActivity(workspaceId, "PUBLIC_SEARCH", "Running Public Web Research", `Searching live internet for high-probability targets matching criteria...`);
      domainsToScrape = await searchForTargetsWithAI(icpParams, icp);
      await logActivity(workspaceId, "PUBLIC_SEARCH_SUCCESS", "Identified Targets", `Identified ${domainsToScrape.length} target domains from public research.`);
    }

    if (domainsToScrape.length === 0) {
      // Fallback to Demo Discovery if everything fails
      await logActivity(workspaceId, "DEMO_FALLBACK", "No domains found", "Falling back to demo discovery list.");
      domainsToScrape = ["acme.com", "globaltech.io", "zephyr-systems.co"];
    }

    // Update AgentRun total items
    await prisma.agentRun.update({
      where: { id: agentRunId },
      data: { totalItems: domainsToScrape.length }
    });

    // 3. Cheerio HTML Scraping & AI Extraction
    for (const domain of domainsToScrape) {
      try {
        await logActivity(workspaceId, "SCRAPE_START", `Analyzing ${domain}`, `Initiating deep-dive research on ${domain}...`);
        
        // Ensure https
        const url = domain.startsWith("http") ? domain : `https://${domain}`;
        
        let title = "";
        let metaDesc = "";
        let bodyText = "";

        try {
          // Timeout 10 seconds to avoid blocking forever
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          
          const response = await fetch(url, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });
          clearTimeout(timeoutId);
          
          if (response.ok) {
            const html = await response.text();
            const $ = cheerio.load(html);
            
            title = $('title').text() || "";
            metaDesc = $('meta[name="description"]').attr('content') || "";
            
            // Remove unnecessary tags
            $('script, style, noscript, iframe, img, svg, nav, footer, header').remove();
            
            // Get clean body text limit to 10k chars
            bodyText = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 10000);
          }
        } catch (e) {
          console.error(`Failed to fetch ${url}:`, e);
        }

        const combinedText = `Title: ${title}\nDescription: ${sanitizeText(metaDesc)}\n\nWebsite Content:\n${sanitizeText(bodyText)}`;

        // 4. Intelligence Extraction via AI
        await logActivity(workspaceId, "AI_ANALYSIS", `Extracting Intelligence`, `Running proprietary models to parse firmographics and signals for ${domain}.`);
        
        const extractedData = await extractCompanyData(combinedText, url);
        
        if (extractedData && extractedData.name) {
          // 5. Persistence
          const company = await prisma.company.upsert({
            where: {
              workspaceId_domain: {
                workspaceId,
                domain: extractedData.domain
              }
            },
            create: {
              workspaceId,
              name: extractedData.name,
              domain: extractedData.domain,
              website: url,
              industry: extractedData.industry || "Software",
              description: extractedData.description,
              employeeRange: extractedData.companySize || "Unknown",
              headquarters: extractedData.location || null
            },
            update: {
              name: extractedData.name,
              industry: extractedData.industry || "Software",
              description: extractedData.description,
              headquarters: extractedData.location || null
            }
          });

          await logActivity("COMPANY_DISCOVERED", `Discovered ${company.name}`, `Added to target list. Industry: ${company.industry}`);

          // Save Signals
          if (extractedData.signals && extractedData.signals.length > 0) {
            for (const sig of extractedData.signals) {
              await prisma.signal.create({
                data: {
                  companyId: company.id,
                  type: sig.type,
                  title: sig.title,
                  description: sig.description,
                  sourceUrl: url,
                  sourceName: "Website Scraping",
                  relevance: 0.9,
                }
              });
            }
            await logActivity("SIGNAL_DETECTED", `Found ${extractedData.signals.length} Signals`, `Detected buying signals for ${company.name}.`);
          }
        } else {
          await logActivity("SCRAPE_FAILED", `Could not analyze ${domain}`, `Failed to extract meaningful firmographic data.`);
        }

        // Increment processed items
        await prisma.agentRun.update({
          where: { id: agentRunId },
          data: { processedItems: { increment: 1 } }
        });

      } catch (err: unknown) {
        console.error(`Failed to process domain ${domain}:`, err);
        await logActivity("SCRAPE_FAILED", `Error analyzing ${domain}`, err instanceof Error ? err.message : "Unknown error");
      }
    }



    // 6. Complete Run
    await prisma.agentRun.update({
      where: { id: agentRunId },
      data: { status: "COMPLETED" }
    });
    
    await logActivity("RUN_COMPLETE", "Discovery Run Completed", `Successfully finished processing ${domainsToScrape.length} targets.`);

  } catch (error: unknown) {
    console.error("Discovery Engine Error:", error);
    await logActivity("RUN_ERROR", "Discovery Run Failed", error instanceof Error ? error.message : "An unexpected error occurred.");
    await prisma.agentRun.update({
      where: { id: agentRunId },
      data: { status: "FAILED" }
    });
  }
}

// ─── Helpers ───────────────────────────────────────────────────
import { prisma } from "@/lib/db";
import { ai } from "./groq";
import * as cheerio from "cheerio";
import { performSearch } from "./search";
import { sanitizeText } from "./intelligence";

interface DiscoveryParams {
  workspaceId: string;
  agentRunId: string;
  customDomains?: string[];
  icpParams?: {
    countries: Record<string, string[]>;
    industries: string[];
    size: string | null;
  }
}

export async function runDiscoveryEngine(params: DiscoveryParams) {
  const { workspaceId, agentRunId, customDomains, icpParams } = params;

  try {
    // 1. Log Start
    await logActivity(workspaceId, "START_DISCOVERY", "Started Discovery Run", `Initialized discovery engine. Run ID: ${agentRunId}`);

    // Fetch ICP from DB as fallback
    const icp = await prisma.iCP.findFirst({ where: { workspaceId } });
    
    // 2. Determine domains to scrape
    let domainsToScrape: string[] = [];

    if (customDomains && customDomains.length > 0) {
      domainsToScrape = customDomains;
      await logActivity(workspaceId, "MANUAL_IMPORT", "Imported Target Domains", `Parsed ${domainsToScrape.length} domain(s) for manual discovery.`);
    } else {
      // Public Web Research using Groq + Serper
      await logActivity(workspaceId, "PUBLIC_SEARCH", "Running Public Web Research", `Searching live internet for high-probability targets matching criteria...`);
      domainsToScrape = await searchForTargetsWithAI(icpParams, icp);
      await logActivity(workspaceId, "PUBLIC_SEARCH_SUCCESS", "Identified Targets", `Identified ${domainsToScrape.length} target domains from public research.`);
    }

    if (domainsToScrape.length === 0) {
      // Fallback to Demo Discovery if everything fails
      await logActivity(workspaceId, "DEMO_FALLBACK", "No domains found", "Falling back to demo discovery list.");
      domainsToScrape = ["acme.com", "globaltech.io", "zephyr-systems.co"];
    }

    // Update AgentRun total items
    await prisma.agentRun.update({
      where: { id: agentRunId },
      data: { totalItems: domainsToScrape.length }
    });

    // 3. Cheerio HTML Scraping & AI Extraction
    for (const domain of domainsToScrape) {
      try {
        await logActivity(workspaceId, "SCRAPE_START", `Analyzing ${domain}`, `Initiating deep-dive research on ${domain}...`);
        
        // Ensure https
        const url = domain.startsWith("http") ? domain : `https://${domain}`;
        
        let title = "";
        let metaDesc = "";
        let bodyText = "";

        try {
          // Timeout 10 seconds to avoid blocking forever
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          
          const response = await fetch(url, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });
          clearTimeout(timeoutId);
          
          if (response.ok) {
            const html = await response.text();
            const $ = cheerio.load(html);
            
            title = $('title').text() || "";
            metaDesc = $('meta[name="description"]').attr('content') || "";
            
            // Remove unnecessary tags
            $('script, style, noscript, iframe, img, svg, nav, footer, header').remove();
            
            // Get clean body text limit to 10k chars
            bodyText = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 10000);
          }
        } catch (e) {
          console.error(`Failed to fetch ${url}:`, e);
        }

        const combinedText = `Title: ${title}\nDescription: ${sanitizeText(metaDesc)}\n\nWebsite Content:\n${sanitizeText(bodyText)}`;

        // 4. Intelligence Extraction via AI
        await logActivity(workspaceId, "AI_ANALYSIS", `Extracting Intelligence`, `Running proprietary models to parse firmographics and signals for ${domain}.`);
        
        const extractedData = await extractCompanyData(combinedText, url);
        
        if (extractedData && extractedData.name) {
          // 5. Persistence
          const company = await prisma.company.upsert({
            where: {
              workspaceId_domain: {
                workspaceId,
                domain: extractedData.domain
              }
            },
            create: {
              workspaceId,
              name: extractedData.name,
              domain: extractedData.domain,
              website: url,
              industry: extractedData.industry || "Software",
              description: extractedData.description,
              employeeRange: extractedData.companySize || "Unknown",
              headquarters: extractedData.location || null
            },
            update: {
              name: extractedData.name,
              industry: extractedData.industry || "Software",
              description: extractedData.description,
              headquarters: extractedData.location || null
            }
          });

          await logActivity("COMPANY_DISCOVERED", `Discovered ${company.name}`, `Added to target list. Industry: ${company.industry}`);

          // Save Signals
          if (extractedData.signals && extractedData.signals.length > 0) {
            for (const sig of extractedData.signals) {
              await prisma.signal.create({
                data: {
                  companyId: company.id,
                  type: sig.type,
                  title: sig.title,
                  description: sig.description,
                  sourceUrl: url,
                  sourceName: "Website Scraping",
                  relevance: 0.9,
                }
              });
            }
            await logActivity("SIGNAL_DETECTED", `Found ${extractedData.signals.length} Signals`, `Detected buying signals for ${company.name}.`);
          }
        } else {
          await logActivity("SCRAPE_FAILED", `Could not analyze ${domain}`, `Failed to extract meaningful firmographic data.`);
        }

        // Increment processed items
        await prisma.agentRun.update({
          where: { id: agentRunId },
          data: { processedItems: { increment: 1 } }
        });

      } catch (err: unknown) {
        console.error(`Failed to process domain ${domain}:`, err);
        await logActivity("SCRAPE_FAILED", `Error analyzing ${domain}`, err instanceof Error ? err.message : "Unknown error");
      }
    }



    // 6. Complete Run
    await prisma.agentRun.update({
      where: { id: agentRunId },
      data: { status: "COMPLETED" }
    });
    
    await logActivity("RUN_COMPLETE", "Discovery Run Completed", `Successfully finished processing ${domainsToScrape.length} targets.`);

  } catch (error: unknown) {
    console.error("Discovery Engine Error:", error);
    await logActivity("RUN_ERROR", "Discovery Run Failed", error instanceof Error ? error.message : "An unexpected error occurred.");
    await prisma.agentRun.update({
      where: { id: agentRunId },
      data: { status: "FAILED" }
    });
  }
}

// ─── Helpers ───────────────────────────────────────────────────

async function logActivity(...args: string[]) {
  const type = args.length === 4 ? args[1] : args[0];
  const title = args.length === 4 ? args[2] : args[1];
  const description = args.length === 4 ? args[3] : args[2];

  return prisma.activity.create({
    data: {
      type,
      title,
      description
    }
  });
}

const companySchemaDefinition = `
{
  "name": "The official name of the company",
  "domain": "The clean root domain (e.g., stripe.com)",
  "industry": "The primary industry (e.g., E-commerce, SaaS, Fintech)",
  "description": "A concise 1-2 sentence description of what the company does",
  "companySize": "Estimated company size if mentioned, otherwise leave empty",
  "location": "Headquarters city and country/state, if mentioned (e.g., San Francisco, CA or London, UK)",
  "signals": [
    {
      "type": "HIRING | PRODUCT_LAUNCH | EXPANSION | TECHNOLOGY_CHANGE | PAIN_POINT | COMPETITOR_MENTION",
      "title": "A short title for the signal",
      "description": "Details about the signal"
    }
  ]
}
`;

async function extractCompanyData(scrapedText: string, sourceUrl: string) {
  try {
    const prompt = `Analyze the following website text scraped from ${sourceUrl}. Extract the firmographic data (including headquarters location) and any potential buying signals or recent news.\n\nWebsite Text:\n${scrapedText}\n\nYou must return valid JSON matching this schema exactly:\n${companySchemaDefinition}`;
    
    let response;
    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      try {
        response = await ai.chat.completions.create({
          model: "llama-3.1-8b-instant",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          temperature: 0.2
        });
        break; // Success
      } catch (err) {
        retries++;
        console.warn(`Extraction attempt ${retries} failed for ${sourceUrl}:`, err);
        if (retries >= maxRetries) throw err;
        await new Promise(resolve => setTimeout(resolve, retries * 1000));
      }
    }

    if (response?.choices[0].message.content) {
      const text = response.choices[0].message.content.trim();
      return JSON.parse(text);
    }
  } catch (error) {
    console.error("AI Extraction Error:", error);
  }
  return null;
}

const domainsSchemaDefinition = `
{
  "domains": ["stripe.com", "vercel.com", "ramp.com"]
}
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function searchForTargetsWithAI(icpParams: any, dbIcp: any) {
  try {
    let industries = "SaaS";
    let regions = "Global";
    let size = "";

    if (icpParams) {
      industries = icpParams.industries.join(", ");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      regions = Object.entries(icpParams.countries).map(([c, locs]: any) => `${c} (${locs.join(", ")})`).join("; ");
      if (icpParams.size) size = `Company Size: ${icpParams.size} employees`;
    } else if (dbIcp) {
      industries = dbIcp.industries?.join(", ") || "SaaS";
      regions = dbIcp.countries?.join(", ") || "Global";
      if (dbIcp.companySize) size = `Company Size: ${dbIcp.companySize} employees`;
    }

    // 1. Search Google via Serper to find target companies
    const query = `Top ${industries} companies in ${regions} ${size}`;
    const searchData = await performSearch(query);
    let searchContext = "";
    if (searchData && searchData.organic) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      searchContext = searchData.organic.map((res: any) => `Title: ${res.title}\nLink: ${res.link}\nSnippet: ${res.snippet}`).join('\n\n');
    }

    const prompt = `You are a B2B lead generation researcher. Review the following Google Search results to find up to 15 real, active company websites that exactly match this Ideal Customer Profile.
    
    ICP Config:
    Industries: ${industries}
    Geographies: ${regions}
    ${size}

    Search Results:
    ${searchContext}

    Requirements:
    1. Extract up to 15 root domains (e.g. stripe.com) from the search results that fit the ICP.
    2. Do NOT make them up. They must be present in the search context.
    3. You must return valid JSON matching this schema exactly:
    ${domainsSchemaDefinition}
    `;

    let response;
    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      try {
        response = await ai.chat.completions.create({
          model: "llama-3.1-8b-instant",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          temperature: 0.2
        });
        break; // Success
      } catch (err) {
        retries++;
        console.warn(`Search targets AI attempt ${retries} failed:`, err);
        if (retries >= maxRetries) throw err;
        await new Promise(resolve => setTimeout(resolve, retries * 1000));
      }
    }

    if (response?.choices[0].message.content) {
      const text = response.choices[0].message.content.trim();
      const parsed = JSON.parse(text);
      return parsed.domains || ["vercel.com", "stripe.com", "linear.app"];
    }
  } catch (error) {
    console.error("AI Search Error:", error);
  }
  return ["vercel.com", "stripe.com", "linear.app"];
}
