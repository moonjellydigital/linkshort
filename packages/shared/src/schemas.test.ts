import { describe, expect, it } from "vitest";
import {
  CreateLinkRequestSchema,
  fieldErrors,
  isHttpUrl,
  isValidSlug,
  MAX_URL_LENGTH,
  StatsQuerySchema,
} from "./schemas.ts";

describe("isHttpUrl", () => {
  it.each(["https://example.com", "http://localhost:3000/a?b=c#d", "https://例え.jp/パス"])(
    "accepts %s",
    (url) => expect(isHttpUrl(url)).toBe(true),
  );

  it.each(["", "example.com", "/relative", "ftp://example.com", "javascript:alert(1)", "data:text/html,x"])(
    "rejects %s",
    (url) => expect(isHttpUrl(url)).toBe(false),
  );
});

describe("isValidSlug", () => {
  it.each(["abc", "Launch-2026", "a_b_c", "x".repeat(32)])("accepts %s", (s) =>
    expect(isValidSlug(s)).toBe(true),
  );

  it.each(["ab", "x".repeat(33), "has space", "dot.ted", "slash/ed", "api", "API", "Assets", "readyz"])(
    "rejects %s",
    (s) => expect(isValidSlug(s)).toBe(false),
  );
});

describe("CreateLinkRequestSchema", () => {
  it("trims input and treats an empty slug as absent", () => {
    expect(CreateLinkRequestSchema.parse({ url: "  https://example.com ", slug: "  " })).toEqual({
      url: "https://example.com",
      slug: undefined,
    });
  });

  it("keeps a valid custom slug", () => {
    expect(CreateLinkRequestSchema.parse({ url: "https://example.com", slug: " docs " }).slug).toBe("docs");
  });

  it("reports one message per field", () => {
    const result = CreateLinkRequestSchema.safeParse({ url: "ftp://x", slug: "api" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error)).toEqual({
        url: "Enter a full address starting with http:// or https://.",
        slug: "That name is reserved. Choose a different one.",
      });
    }
  });

  it("enforces the URL length limit", () => {
    const url = `https://example.com/${"a".repeat(MAX_URL_LENGTH)}`;
    expect(CreateLinkRequestSchema.safeParse({ url }).success).toBe(false);
  });
});

describe("StatsQuerySchema", () => {
  it("defaults and coerces", () => {
    expect(StatsQuerySchema.parse({})).toEqual({ days: 7 });
    expect(StatsQuerySchema.parse({ days: "30" })).toEqual({ days: 30 });
  });

  it.each(["0", "91", "1.5", "abc"])("rejects days=%s", (days) => {
    expect(StatsQuerySchema.safeParse({ days }).success).toBe(false);
  });
});
