/**
 * Tests: Demo Fixtures
 * Validates that demo data is complete, clearly marked, and non-fabricating
 */

import {
  DEMO_COMPANIES,
  DEMO_SIGNALS,
  DEMO_CONTACTS,
  DEMO_ICP,
  DEMO_OFFER,
  DEMO_OPPORTUNITIES,
} from "@/lib/demo/fixtures";

describe("Demo Fixtures — Data Integrity", () => {
  describe("DEMO_COMPANIES", () => {
    it("contains at least 3 companies", () => {
      expect(DEMO_COMPANIES.length).toBeGreaterThanOrEqual(3);
    });

    it("every company has required fields", () => {
      for (const company of DEMO_COMPANIES) {
        expect(company.name).toBeTruthy();
        expect(company.domain).toBeTruthy();
        expect(company.industry).toBeTruthy();
        expect(company.status).toBeTruthy();
        expect(company.discoverySource).toBe("demo");
      }
    });

    it("all descriptions are marked as [DEMO]", () => {
      for (const company of DEMO_COMPANIES) {
        expect(company.description).toContain("[DEMO]");
      }
    });

    it("all domains are unique", () => {
      const domains = DEMO_COMPANIES.map((c) => c.domain);
      const unique = new Set(domains);
      expect(unique.size).toBe(domains.length);
    });
  });

  describe("DEMO_SIGNALS", () => {
    it("contains at least 3 signals", () => {
      expect(DEMO_SIGNALS.length).toBeGreaterThanOrEqual(3);
    });

    it("every signal has a source URL and source name", () => {
      for (const signal of DEMO_SIGNALS) {
        expect(signal.sourceUrl).toBeTruthy();
        expect(signal.sourceName).toBeTruthy();
        expect(signal.type).toBeTruthy();
        expect(signal.title).toBeTruthy();
      }
    });

    it("relevance scores are between 0 and 1", () => {
      for (const signal of DEMO_SIGNALS) {
        expect(signal.relevance).toBeGreaterThanOrEqual(0);
        expect(signal.relevance).toBeLessThanOrEqual(1);
      }
    });

    it("all signals reference a known company", () => {
      const companyNames = new Set(DEMO_COMPANIES.map((c) => c.name));
      for (const signal of DEMO_SIGNALS) {
        expect(companyNames.has(signal.companyName)).toBe(true);
      }
    });
  });

  describe("DEMO_CONTACTS", () => {
    it("every contact has name, title, and company", () => {
      for (const contact of DEMO_CONTACTS) {
        expect(contact.fullName).toBeTruthy();
        expect(contact.title).toBeTruthy();
        expect(contact.companyName).toBeTruthy();
      }
    });

    it("buyer scores are between 0 and 100", () => {
      for (const contact of DEMO_CONTACTS) {
        expect(contact.buyerScore).toBeGreaterThanOrEqual(0);
        expect(contact.buyerScore).toBeLessThanOrEqual(100);
      }
    });

    it("all contacts reference a known company", () => {
      const companyNames = new Set(DEMO_COMPANIES.map((c) => c.name));
      for (const contact of DEMO_CONTACTS) {
        expect(companyNames.has(contact.companyName)).toBe(true);
      }
    });
  });

  describe("DEMO_OPPORTUNITIES", () => {
    it("all scores are between 0 and 100", () => {
      for (const opp of DEMO_OPPORTUNITIES) {
        expect(opp.icpFitScore).toBeGreaterThanOrEqual(0);
        expect(opp.icpFitScore).toBeLessThanOrEqual(100);
        expect(opp.problemEvidenceScore).toBeGreaterThanOrEqual(0);
        expect(opp.problemEvidenceScore).toBeLessThanOrEqual(100);
        expect(opp.overallScore).toBeGreaterThanOrEqual(0);
        expect(opp.overallScore).toBeLessThanOrEqual(100);
      }
    });

    it("every opportunity has a problem statement and why-now", () => {
      for (const opp of DEMO_OPPORTUNITIES) {
        expect(opp.problemStatement).toBeTruthy();
        expect(opp.whyNow).toBeTruthy();
      }
    });

    it("all opportunities reference a known company", () => {
      const companyNames = new Set(DEMO_COMPANIES.map((c) => c.name));
      for (const opp of DEMO_OPPORTUNITIES) {
        expect(companyNames.has(opp.companyName)).toBe(true);
      }
    });
  });

  describe("DEMO_ICP", () => {
    it("has valid structure", () => {
      expect(DEMO_ICP.name).toBeTruthy();
      expect(DEMO_ICP.industries.length).toBeGreaterThan(0);
      expect(DEMO_ICP.companySizeMin).toBeGreaterThan(0);
      expect(DEMO_ICP.companySizeMax).toBeGreaterThan(DEMO_ICP.companySizeMin);
    });
  });

  describe("DEMO_OFFER", () => {
    it("has valid structure", () => {
      expect(DEMO_OFFER.name).toBeTruthy();
      expect(DEMO_OFFER.targetProblems.length).toBeGreaterThan(0);
      expect(DEMO_OFFER.differentiators.length).toBeGreaterThan(0);
    });
  });
});
