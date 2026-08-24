/**
 * Tests: LLM response validation (`lib/ai/schemas.ts`)
 *
 * This is the boundary every engine depends on. The bugs it exists to stop were
 * real: a signal type the model invented went straight into a Postgres enum
 * column and failed the insert *after* other rows had been written, and a
 * response missing its `domains` key used to fall back to a hardcoded list of
 * plausible companies so a broken run looked successful.
 *
 * No mocks needed — these are pure functions.
 */

import {
  parseAIResponse,
  SignalTypeSchema,
  SIGNAL_TYPES,
  DiscoveryDomainsSchema,
  ExtractedCompanySchema,
  IntelligenceSchema,
  OutreachSchema,
  ConversationReplySchema,
} from "@/lib/ai/schemas";

describe("parseAIResponse", () => {
  it("throws a labelled error when the model returns nothing", () => {
    for (const empty of [null, undefined, "", "   ", "\n\t"]) {
      expect(() => parseAIResponse(empty, DiscoveryDomainsSchema, "Target search failed")).toThrow(
        /Target search failed: the AI returned an empty response/
      );
    }
  });

  it("throws with the start of the payload when the response is not JSON", () => {
    expect(() =>
      parseAIResponse("Sure! Here are the domains you asked for:", DiscoveryDomainsSchema, "Target search failed")
    ).toThrow(/not valid JSON/);

    // The offending text has to be in the message — otherwise an AgentRun's
    // errorMessage says "invalid JSON" and nothing about what came back.
    expect(() =>
      parseAIResponse("Sure! Here are the domains", DiscoveryDomainsSchema, "Target search failed")
    ).toThrow(/Sure! Here are the domains/);
  });

  it("truncates a huge non-JSON payload to 200 characters", () => {
    const huge = "x".repeat(5000);
    try {
      parseAIResponse(huge, DiscoveryDomainsSchema, "label");
      throw new Error("should have thrown");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("x".repeat(200));
      expect(message).not.toContain("x".repeat(201));
    }
  });

  it("names the failing field when valid JSON has the wrong shape", () => {
    expect(() => parseAIResponse('{"domains": "stripe.com"}', DiscoveryDomainsSchema, "Target search failed")).toThrow(
      /did not match the expected shape.*domains/
    );
  });

  it("does not invent a fallback when a required key is missing", () => {
    // The whole point: `{}` must be an error, never an empty-but-successful result.
    expect(() => parseAIResponse("{}", DiscoveryDomainsSchema, "Target search failed")).toThrow(
      /did not match the expected shape/
    );
  });

  it("returns the parsed data on a valid response", () => {
    const result = parseAIResponse('{"domains": ["stripe.com", "vercel.com"]}', DiscoveryDomainsSchema, "label");
    expect(result.domains).toEqual(["stripe.com", "vercel.com"]);
  });

  it("tolerates the whitespace and newlines models pad JSON with", () => {
    const result = parseAIResponse('\n  {"domains": ["a.com"]}  \n', DiscoveryDomainsSchema, "label");
    expect(result.domains).toEqual(["a.com"]);
  });

  it("reports at most 5 issues so the message stays readable", () => {
    const badSignals = JSON.stringify({
      name: 1,
      domain: 2,
      industry: 3,
      description: 4,
      companySize: 5,
      location: 6,
    });
    const message = (() => {
      try {
        parseAIResponse(badSignals, ExtractedCompanySchema, "label");
      } catch (err) {
        return (err as Error).message;
      }
      return "";
    })();
    expect(message.split(";").length).toBeLessThanOrEqual(5);
  });
});

describe("SignalTypeSchema", () => {
  it("accepts every type the database declares", () => {
    for (const type of SIGNAL_TYPES) {
      expect(SignalTypeSchema.parse(type)).toBe(type);
    }
  });

  it("degrades an invented type to PRESS_MENTION instead of failing", () => {
    // The model reliably invents these. Before this schema they were written
    // raw into an enum column and killed the insert.
    for (const invented of ["ACQUISITION", "hiring", "NEW_OFFICE", "", "🎉"]) {
      expect(SignalTypeSchema.parse(invented)).toBe("PRESS_MENTION");
    }
  });

  it("degrades a non-string to PRESS_MENTION", () => {
    expect(SignalTypeSchema.parse(null)).toBe("PRESS_MENTION");
    expect(SignalTypeSchema.parse(42)).toBe("PRESS_MENTION");
  });
});

describe("ExtractedCompanySchema", () => {
  const valid = { name: "Stripe", domain: "stripe.com" };

  it("requires a name and a domain, since both columns are non-null", () => {
    expect(() => ExtractedCompanySchema.parse({ domain: "stripe.com" })).toThrow();
    expect(() => ExtractedCompanySchema.parse({ name: "Stripe" })).toThrow();
    expect(() => ExtractedCompanySchema.parse({ name: "", domain: "stripe.com" })).toThrow();
  });

  it("accepts a minimal company and defaults signals to an empty array", () => {
    const result = ExtractedCompanySchema.parse(valid);
    expect(result.signals).toEqual([]);
  });

  it("treats a null or missing signals array as empty", () => {
    expect(ExtractedCompanySchema.parse({ ...valid, signals: null }).signals).toEqual([]);
    expect(ExtractedCompanySchema.parse({ ...valid, signals: undefined }).signals).toEqual([]);
  });

  it("still rejects a signals value of the wrong type", () => {
    expect(() => ExtractedCompanySchema.parse({ ...valid, signals: "lots of them" })).toThrow();
  });

  it("normalises an invented signal type inside the array", () => {
    const result = ExtractedCompanySchema.parse({
      ...valid,
      signals: [{ type: "ACQUISITION_RUMOUR", title: "Rumoured acquisition" }],
    });
    expect(result.signals[0].type).toBe("PRESS_MENTION");
  });

  it("requires a title on each signal, since Signal.title is non-null", () => {
    expect(() =>
      ExtractedCompanySchema.parse({ ...valid, signals: [{ type: "HIRING", title: "" }] })
    ).toThrow();
  });
});

describe("IntelligenceSchema", () => {
  it("accepts a thin response rather than demanding every field", () => {
    // A sparse-but-honest answer should still produce a scored opportunity.
    const result = IntelligenceSchema.parse({ company_summary: "A payments company." });
    expect(result.problems).toEqual([]);
    expect(result.evidence).toEqual([]);
    expect(result.signals).toEqual([]);
    expect(result.decision_makers).toEqual([]);
  });

  it("coerces a numeric confidence sent as a string", () => {
    expect(IntelligenceSchema.parse({ confidence: "85" }).confidence).toBe(85);
  });

  it("coerces the nested scoring numbers models send as strings", () => {
    const result = IntelligenceSchema.parse({
      scoring_assessment: { icp_fit: { score: "88", reasoning: "Strong match" } },
    });
    expect(result.scoring_assessment?.icp_fit?.score).toBe(88);
  });

  it("requires a title on evidence, since Evidence.title is non-null", () => {
    expect(() => IntelligenceSchema.parse({ evidence: [{ summary: "no title" }] })).toThrow();
  });

  it("allows a decision maker with no name — Hunter often returns only an email", () => {
    const result = IntelligenceSchema.parse({
      decision_makers: [{ email: "cto@stripe.com", confidence: 0.9 }],
    });
    expect(result.decision_makers).toHaveLength(1);
  });
});

describe("OutreachSchema", () => {
  it("requires a non-empty subject and body", () => {
    // A blank draft must fall through to the labelled safe template, not save.
    expect(() => OutreachSchema.parse({ subject: "", body: "Hi" })).toThrow();
    expect(() => OutreachSchema.parse({ subject: "Hi", body: "" })).toThrow();
    expect(() => OutreachSchema.parse({ body: "Hi" })).toThrow();
  });

  it("accepts a valid draft with no evidence ids", () => {
    const result = OutreachSchema.parse({ subject: "Quick question", body: "Hello there" });
    expect(result.evidence_used_ids).toEqual([]);
  });
});

describe("ConversationReplySchema", () => {
  it("degrades an unrecognised intent to UNKNOWN", () => {
    expect(ConversationReplySchema.parse({ intent: "VERY_KEEN" }).intent).toBe("UNKNOWN");
    expect(ConversationReplySchema.parse({}).intent).toBe("UNKNOWN");
  });

  it("nulls the statuses the prompt used to ask for that do not exist in the enum", () => {
    // The prompt requested QUALIFIED and WON; OpportunityStatus has neither.
    // Null leaves the opportunity's status untouched instead of failing the write.
    expect(ConversationReplySchema.parse({ opportunityStatus: "QUALIFIED" }).opportunityStatus).toBeNull();
    expect(ConversationReplySchema.parse({ opportunityStatus: "WON" }).opportunityStatus).toBeNull();
  });

  it("keeps the two statuses the caller actually acts on", () => {
    expect(ConversationReplySchema.parse({ opportunityStatus: "CONVERTED" }).opportunityStatus).toBe("CONVERTED");
    expect(ConversationReplySchema.parse({ opportunityStatus: "LOST" }).opportunityStatus).toBe("LOST");
  });
});
