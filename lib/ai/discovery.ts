import type { z } from "zod";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { ai } from "./gemini";
import { performSearch } from "./search";
import { sanitizeText } from "./intelligence";
import { DiscoveryDomainsSchema, ExtractedCompanySchema, parseAIResponse } from "./schemas";

interface DiscoveryParams {
  workspaceId: string;
  agentRunId: string;
  customDomains?: string[];
  icpParams?: {
    countries: Record<string, string[]>;
    industries: string[];
    size: string | null;
    keywords?: string[];
    excludeKeywords?: string[];
  }
}

export async function runDiscoveryEngine(params: DiscoveryParams) {
  const { workspaceId, agentRunId, customDomains, icpParams } = params;

  try {
    // Mark the run as actually running. It's created QUEUED by the caller and
    // was previously only ever moved to COMPLETED/FAILED, so an in-progress run
    // was indistinguishable from one that never started — and the stale-run
    // sweep had no way to tell "waiting to begin" from "begun and then died".
    await prisma.agentRun.update({
      where: { id: agentRunId },
      data: { status: "RUNNING", startedAt: new Date() }
    });

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
      // Previously this silently fell back to a hardcoded demo company list
      // (acme.com, globaltech.io, zephyr-systems.co), which meant a totally
      // failed search looked identical to real results in the UI — actively
      // misleading for a lead-intelligence tool. Failing loudly here instead:
      // the run shows as FAILED with a clear reason, and the run itself
      // throws before any fake data gets persisted.
      await logActivity(workspaceId, "NO_RESULTS", "No matching companies found", "The search returned no results — try broadening filters (fewer exclusions, fewer keywords, or a wider region) and run again.");
      throw new Error("No target domains found for the given criteria. Try broadening your filters — fewer exclusions, fewer keywords, or a wider region/industry selection often helps.");
    }

    // Update AgentRun total items
    await prisma.agentRun.update({
      where: { id: agentRunId },
      data: { totalItems: domainsToScrape.length }
    });

    // 3. Jina AI Reader Scraping & AI Extraction — processed in small concurrent
    //    batches instead of one domain at a time, to cut wall-clock time while
    //    staying under free-tier per-minute rate limits (Jina + Gemini Flash).
    const processDomain = async (domain: string) => {
      try {
        await logActivity(workspaceId, "SCRAPE_START", `Analyzing ${domain}`, `Initiating deep-dive research on ${domain}...`);
        
        // Ensure https
        const url = domain.startsWith("http") ? domain : `https://${domain}`;

        // Use Jina AI Reader — handles JS-heavy sites, anti-bot, returns clean Markdown
        let combinedText = "";
        try {
          const jinaKey = process.env.JINA_API_KEY;
          const jinaUrl = `https://r.jina.ai/${url}`;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 20000);

          const jinaResponse = await fetch(jinaUrl, {
            signal: controller.signal,
            headers: {
              'Authorization': jinaKey ? `Bearer ${jinaKey}` : '',
              'Accept': 'text/plain',
              'X-Return-Format': 'markdown',
            }
          });
          clearTimeout(timeoutId);

          if (jinaResponse.ok) {
            const markdown = await jinaResponse.text();
            // Cap at 15k chars — Gemini can handle far more but we keep prompts focused
            combinedText = sanitizeText(markdown).substring(0, 15000);
          } else {
            console.warn(`Jina failed for ${url}: ${jinaResponse.status}`);
          }
        } catch (e) {
          console.error(`Jina fetch failed for ${url}:`, e);
        }

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

          await logActivity(workspaceId, "COMPANY_DISCOVERED", `Discovered ${company.name}`, `Added to target list. Industry: ${company.industry}`);

          // Save Signals
          if (extractedData.signals && extractedData.signals.length > 0) {
            for (const sig of extractedData.signals) {
              await prisma.signal.create({
                data: {
                  companyId: company.id,
                  type: sig.type, // Already narrowed to a valid SignalType by the schema
                  title: sig.title,
                  description: sig.description,
                  sourceUrl: url,
                  sourceName: "Website Scraping",
                  // Not scored. This was hardcoded to 0.9 — a confidence number
                  // nothing had actually measured. Left null until something does.
                  relevance: null,
                }
              });
            }
            await logActivity(workspaceId, "SIGNAL_DETECTED", `Found ${extractedData.signals.length} Signals`, `Detected buying signals for ${company.name}.`);
          }
        } else {
          await logActivity(workspaceId, "SCRAPE_FAILED", `Could not analyze ${domain}`, `Failed to extract meaningful firmographic data.`);
        }

        // Increment processed items
        await prisma.agentRun.update({
          where: { id: agentRunId },
          data: { processedItems: { increment: 1 } }
        });

      } catch (err: unknown) {
        console.error(`Failed to process domain ${domain}:`, err);
        await logActivity(workspaceId, "SCRAPE_FAILED", `Error analyzing ${domain}`, err instanceof Error ? err.message : "Unknown error");
      }
    };

    // Process in batches of 3 concurrently — enough to meaningfully cut total
    // runtime without bursting past free-tier RPM ceilings on Jina/Gemini.
    const BATCH_SIZE = 3;
    for (let i = 0; i < domainsToScrape.length; i += BATCH_SIZE) {
      const batch = domainsToScrape.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(processDomain));
    }

    // 6. Complete Run
    await prisma.agentRun.update({
      where: { id: agentRunId },
      data: { status: "COMPLETED", completedAt: new Date() }
    });
    
    await logActivity(workspaceId, "RUN_COMPLETE", "Discovery Run Completed", `Successfully finished processing ${domainsToScrape.length} targets.`);

  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "An unexpected error occurred.";
    console.error("Discovery Engine Error:", error);
    await logActivity(workspaceId, "RUN_ERROR", "Discovery Run Failed", reason);
    // Record the reason on the run itself, not just in the console and the
    // activity feed — researchCompany already does this, and without it a
    // FAILED discovery run carries no explanation anywhere queryable.
    await prisma.agentRun.update({
      where: { id: agentRunId },
      data: { status: "FAILED", errorMessage: reason, completedAt: new Date() }
    });
  }
}

// ─── Helpers ───────────────────────────────────────────────────

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

async function extractCompanyData(
  scrapedText: string,
  sourceUrl: string
): Promise<z.infer<typeof ExtractedCompanySchema> | null> {
  try {
    const prompt = `Analyze the following website text scraped from ${sourceUrl}. Extract the firmographic data (including headquarters location) and any potential buying signals or recent news.\n\nWebsite Text:\n${scrapedText}\n\nYou must return valid JSON matching this schema exactly:\n${companySchemaDefinition}`;

    let response;
    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      try {
        response = await ai.chat.completions.create({
          model: "openai/gpt-oss-120b",
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
      // Validated, not just parsed: `signals[].type` was previously written
      // straight into a SignalType enum column, so any value the model invented
      // failed the insert mid-loop. Returning null on a bad response keeps the
      // existing behaviour — this one domain logs SCRAPE_FAILED and the batch
      // carries on — rather than aborting the whole run for one bad page.
      return parseAIResponse(
        response.choices[0].message.content,
        ExtractedCompanySchema,
        `Extraction failed for ${sourceUrl}`
      );
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

// Domains (and matching brand terms) that should never be treated as
// prospects — these are massive, already-dominant enterprises, not realistic
// outbound leads. Broad-category web search ("e-commerce companies in USA")
// will surface these regardless of query phrasing, since they dominate
// nearly all web content for their category (hiring volume, directory
// listings, news mentions). This is a hard, deterministic filter rather than
// relying on the AI to "remember" to skip them — expand it as you see more
// giants slip through for whatever ICP you're targeting.
const ENTERPRISE_EXCLUSIONS: { domain: string; term: string }[] = [
  { domain: "amazon.com", term: "Amazon" },
  { domain: "walmart.com", term: "Walmart" },
  { domain: "apple.com", term: "Apple" },
  { domain: "ebay.com", term: "eBay" },
  { domain: "target.com", term: "Target" },
  { domain: "costco.com", term: "Costco" },
  { domain: "bestbuy.com", term: "\"Best Buy\"" },
  { domain: "homedepot.com", term: "\"Home Depot\"" },
  { domain: "wholefoodsmarket.com", term: "\"Whole Foods\"" },
  { domain: "kroger.com", term: "Kroger" },
  { domain: "lowes.com", term: "Lowe's" },
  { domain: "macys.com", term: "Macy's" },
  { domain: "google.com", term: "Google" },
  { domain: "microsoft.com", term: "Microsoft" },
  { domain: "salesforce.com", term: "Salesforce" },
  { domain: "oracle.com", term: "Oracle" },
  { domain: "sap.com", term: "SAP" },
  { domain: "shopify.com", term: "Shopify" },
  { domain: "alibaba.com", term: "Alibaba" },
  { domain: "netflix.com", term: "Netflix" },
  { domain: "meta.com", term: "Meta" },
];
const EXCLUDED_DOMAIN_SET = new Set(ENTERPRISE_EXCLUSIONS.map(e => e.domain));

// Returns the discovered domains, or throws with the reason it couldn't.
// It must never return a placeholder list — see the notes in the tail of this
// function.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function searchForTargetsWithAI(icpParams: any, dbIcp: any): Promise<string[]> {
  try {
    let industries = "SaaS";
    let regions = "Global";
    let size = "";
    let keywords: string[] = [];
    let excludeKeywords: string[] = [];

    if (icpParams) {
      industries = icpParams.industries.join(", ");
      // Keep regions compact — "United States (ALL); United Kingdom (ALL)"
      // adds length without adding real search signal, and was a meaningful
      // contributor to queries long enough to get rejected outright by
      // Serper. When a country has specific cities/states picked, cap how
      // many get listed so a large selection can't blow the query up either.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      regions = Object.entries(icpParams.countries).map(([c, locs]: any) => {
        if (!locs || locs.length === 0 || locs.includes("ALL")) return c;
        return `${c} (${locs.slice(0, 3).join(", ")})`;
      }).join(", ");
      if (icpParams.size) size = `Company Size: ${icpParams.size} employees`;
      keywords = icpParams.keywords || [];
      excludeKeywords = icpParams.excludeKeywords || [];
    } else if (dbIcp) {
      industries = dbIcp.industries?.join(", ") || "SaaS";
      regions = dbIcp.countries?.join(", ") || "Global";
      if (dbIcp.companySize) size = `Company Size: ${dbIcp.companySize} employees`;
      keywords = dbIcp.buyingSignals || [];
      excludeKeywords = dbIcp.excludeKeywords || [];
    }

    // 1. Search Google via Serper — multiple signal-based queries instead of one
    //    "Top X companies" query. "Top/Best" phrasing reliably surfaces listicle
    //    articles (G2, Forbes, Capterra roundups) dominated by famous category
    //    leaders, not real prospectable mid-market companies. Querying on real
    //    buying-signal language instead (hiring, funding, launching) surfaces a
    //    wider, less-famous, more relevant candidate pool — and running several
    //    query angles instead of one also gives the extraction step a bigger
    //    pool of distinct domains to choose from.
    // Only wrap industries in an exact-phrase quote when there's a single one —
    // a quoted multi-industry string like "E-commerce, SaaS" almost never
    // appears verbatim on any real page, and silently starves the search.
    // Keep each query component short so the combined string stays well under
    // Serper's limit. Exclusion clauses are NOT added to the query text at all —
    // they're enforced by the deterministic EXCLUDED_DOMAIN_SET filter after
    // results come back, which is both more reliable and costs zero query length.
    // Trim each input component before combining so no single field can blow up.
    const industryTerm = industries.includes(",") ? industries : `"${industries}"`;
    const safeIndustry = industryTerm.slice(0, 40);
    const safeRegion   = regions.slice(0, 40);
    const safeSize     = size ? size.slice(0, 30) : "";
    const keywordVariants = keywords.length > 0 ? keywords.slice(0, 3) : [""];

    // Add up to 5 user exclusions directly to the Google search as negative match
    // terms (-"term"). This powerfully narrows down the search before results are
    // even returned. We cap it at 5 so the query string doesn't get too long.
    const userExcludeClause = excludeKeywords.length > 0
      ? " " + excludeKeywords.slice(0, 5).map(k => `-"${k.replace(/"/g, '')}"`).join(" ")
      : "";

    const buildAngles = (kw: string) => {
      const kwClause = kw ? ` ${kw.slice(0, 25)}` : "";
      return [
        `${safeIndustry} companies hiring ${safeRegion}${kwClause}${userExcludeClause}`.trim(),
        `${safeIndustry} startups funding "series a" OR "series b" ${safeRegion}${userExcludeClause}`.trim(),
        `${safeIndustry} companies ${safeRegion} ${safeSize}${userExcludeClause}`.trim(),
      ];
    };

    const queryAngles = keywordVariants.flatMap(buildAngles);

    const searchResults = await Promise.all(queryAngles.map(q =>
      performSearch(q).catch(err => {
        // Don't discard the reason — this is the only place it's visible.
        console.error(`Target search query failed ("${q}"):`, err);
        return null;
      })
    ));

    // Merge + dedupe organic results across all query angles by link
    const seenLinks = new Set<string>();
    const mergedResults: { title: string; link: string; snippet: string }[] = [];
    for (const searchData of searchResults) {
      if (searchData && searchData.organic) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const res of searchData.organic as any[]) {
          if (res.link && !seenLinks.has(res.link)) {
            seenLinks.add(res.link);
            mergedResults.push(res);
          }
        }
      }
    }

    // Nothing came back from any angle. There is no source material for the
    // model to extract domains from, so calling it would either return an
    // empty list or invite it to invent one. Fail here with the actual
    // reason rather than letting this surface downstream as the misleading
    // "no matches — try broadening your filters".
    if (mergedResults.length === 0) {
      const everyQueryFailed = searchResults.every(r => r === null);
      throw new Error(everyQueryFailed
        ? `Web search failed for all ${queryAngles.length} queries. Check SERPER_API_KEY and the Serper error logged above.`
        : `Web search returned no results for any of the ${queryAngles.length} queries built from this ICP.`);
    }

    const searchContext = mergedResults
      .map(res => `Title: ${res.title}\nLink: ${res.link}\nSnippet: ${res.snippet}`)
      .join('\n\n');

    const prompt = `You are a B2B lead generation researcher. Review the following Google Search results to find up to 40 real, active company websites that exactly match this Ideal Customer Profile. Prefer specific, real companies over famous household names — avoid companies that only appear because they were mentioned in a "best of" or "top X" listicle rather than because they genuinely match the ICP.
    
    ICP Config:
    Industries: ${industries}
    Geographies: ${regions}
    ${size}

    Search Results:
    ${searchContext}

    Requirements:
    1. Extract up to 40 root domains (e.g. stripe.com) from the search results that fit the ICP.
    2. Do NOT make them up. They must be present in the search context.
    3. Prefer smaller and mid-sized real companies over famous market leaders — if a domain only appears because it was in a "best of" or ranking-style article rather than a genuine ICP match, skip it.
    ${excludeKeywords.length > 0 ? `4. Do NOT include any of the following companies under any circumstances, even if they appear in the search results: ${excludeKeywords.join(", ")}.\n    5. You must return valid JSON matching this schema exactly:` : "4. You must return valid JSON matching this schema exactly:"}
    ${domainsSchemaDefinition}
    `;

    let response;
    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      try {
        response = await ai.chat.completions.create({
          model: "openai/gpt-oss-120b",
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

    if (!response?.choices[0].message.content) {
      throw new Error("Target search failed: the AI returned an empty response when asked to extract domains from the search results.");
    }

    // There is deliberately no hardcoded domain list here. This used to read
    //   parsed.domains || ["vercel.com", "stripe.com", "linear.app"]
    // so a model response missing its "domains" key produced three plausible
    // companies and the run reported success — a broken run was
    // indistinguishable from a working one. A malformed response is a
    // failure; say so and let the caller mark the AgentRun FAILED.
    const { domains } = parseAIResponse(
      response.choices[0].message.content,
      DiscoveryDomainsSchema,
      "Target search failed"
    );

    // Deterministic final filter — doesn't rely on the AI actually honoring
    // the "don't include X" instruction in the prompt, since instructions
    // can occasionally be missed. A plain Set lookup can't be.
    const filtered = domains.filter(d => !EXCLUDED_DOMAIN_SET.has(d.toLowerCase().replace(/^www\./, "")));
    return filtered.length > 0 ? filtered : domains;
  } catch (error) {
    // No fake-domain fallback here either. Previously every failure in this
    // function — dead Groq key, network drop, unparseable JSON — was
    // swallowed and the same three domains were returned, so the run looked
    // successful. Log the real reason, then rethrow: runDiscoveryEngine's
    // handler writes it to the activity log and marks the AgentRun FAILED.
    console.error("AI Search Error:", error);
    throw new Error(`Target search failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
