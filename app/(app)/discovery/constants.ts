/**
 * Fixed option lists for the discovery form.
 *
 * These were inline at the top of `DiscoveryClient.tsx`. They are the contract
 * between the form and `lib/ai/discovery.ts` — `SIZE_BUCKETS` values in
 * particular are sent to the engine verbatim and end up in the search query, so
 * changing a string here changes what gets searched for.
 */

/** Shown as pills without searching. Any other country is reachable via search. */
export const DEFAULT_COUNTRIES = [
  "United States", "United Kingdom", "Canada", "Australia",
  "Germany", "France", "India", "Brazil", "Japan", "Singapore",
  "Netherlands", "Sweden", "Spain", "Italy", "Mexico", "Ireland",
];

/** Must stay in step with the keys of `KNOWN_COMPANIES`, which drives the
 *  suggested-exclusion list for whichever industries are checked. */
export const INDUSTRIES = [
  "SaaS", "E-commerce", "Fintech", "Healthcare", "Marketing",
  "Real Estate", "Manufacturing", "Retail", "Consumer brands",
  "Logistics", "EdTech", "Cybersecurity",
];

export const SIZE_BUCKETS = [
  "1-10", "11-50", "51-200", "201-500", "501-1000", "1000+",
];

/** Index into `SIZE_BUCKETS`. 2 is "51-200". */
export const DEFAULT_SIZE_INDEX = 2;
