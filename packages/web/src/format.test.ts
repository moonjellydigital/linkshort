import { describe, expect, it } from "vitest";
import { barPercent, displayUrl, formatRelative, formatUtcDay, shortUrl } from "./format.ts";

describe("shortUrl", () => {
  it("joins origin and slug without doubling slashes", () => {
    expect(shortUrl("http://app:3000/", "Abc-1")).toBe("http://app:3000/Abc-1");
  });
});

describe("displayUrl", () => {
  it.each([
    ["https://example.com/", "example.com"],
    ["http://example.com/a/", "example.com/a/"],
    ["https://example.com?q=1", "example.com?q=1"],
  ])("%s → %s", (input, expected) => expect(displayUrl(input)).toBe(expected));
});

describe("formatUtcDay", () => {
  it("formats in UTC regardless of the runtime zone", () => {
    expect(formatUtcDay("2026-10-08", "en-US")).toBe("Thu, Oct 8");
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  it.each([
    ["2026-10-08T11:59:30Z", "just now"],
    ["2026-10-08T11:55:00Z", "5 minutes ago"],
    ["2026-10-08T09:00:00Z", "3 hours ago"],
    ["2026-10-07T12:00:00Z", "yesterday"],
  ])("%s → %s", (iso, expected) => expect(formatRelative(iso, now, "en-US")).toBe(expected));
});

describe("barPercent", () => {
  it("scales to the maximum and handles empty series", () => {
    expect(barPercent(5, 10)).toBe(50);
    expect(barPercent(0, 10)).toBe(0);
    expect(barPercent(3, 0)).toBe(0);
  });
});
