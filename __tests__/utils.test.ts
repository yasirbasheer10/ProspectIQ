/**
 * Tests: Utility functions
 */

import { cn, formatNumber, truncate, getDomainFromUrl } from "@/lib/utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("handles conditional classes", () => {
    expect(cn("a", false && "b", "c")).toBe("a c");
  });

  it("deduplicates tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});

describe("formatNumber", () => {
  it("formats millions", () => {
    expect(formatNumber(1_500_000)).toBe("1.5M");
  });
  it("formats thousands", () => {
    expect(formatNumber(2_500)).toBe("2.5K");
  });
  it("returns small numbers as-is", () => {
    expect(formatNumber(42)).toBe("42");
  });
});

describe("truncate", () => {
  it("does not truncate short strings", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });
  it("truncates long strings with ellipsis", () => {
    const result = truncate("hello world this is long", 10);
    expect(result).toHaveLength(10);
    expect(result.endsWith("...")).toBe(true);
  });
});

describe("getDomainFromUrl", () => {
  it("extracts domain from URL", () => {
    expect(getDomainFromUrl("https://www.example.com/path")).toBe("example.com");
  });
  it("returns input if not a valid URL", () => {
    expect(getDomainFromUrl("not-a-url")).toBe("not-a-url");
  });
});
