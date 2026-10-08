import { describe, expect, it } from "vitest";
import { fillDailySeries, startOfUtcDay, trailingUtcDays } from "./stats.ts";

describe("trailingUtcDays", () => {
  it("covers N whole UTC days ending with today", () => {
    const { from, to } = trailingUtcDays(new Date("2026-10-08T15:42:00Z"), 7);
    expect(from.toISOString()).toBe("2026-10-02T00:00:00.000Z");
    expect(to.toISOString()).toBe("2026-10-09T00:00:00.000Z");
  });

  it("is anchored to UTC regardless of offset in the input", () => {
    // 23:30 at UTC-05:00 is already the next day in UTC.
    const { to } = trailingUtcDays(new Date("2026-10-08T23:30:00-05:00"), 1);
    expect(to.toISOString()).toBe("2026-10-10T00:00:00.000Z");
  });

  it.each([0, -1, 2.5])("rejects days=%s", (days) => {
    expect(() => trailingUtcDays(new Date(), days)).toThrow(RangeError);
  });
});

describe("fillDailySeries", () => {
  const from = new Date("2026-10-01T00:00:00Z");
  const to = new Date("2026-10-04T00:00:00Z");

  it("zero-fills missing days, oldest first", () => {
    expect(fillDailySeries(from, to, [{ day: "2026-10-02", clicks: 5 }])).toEqual([
      { date: "2026-10-01", clicks: 0 },
      { date: "2026-10-02", clicks: 5 },
      { date: "2026-10-03", clicks: 0 },
    ]);
  });

  it("ignores out-of-range days and sums duplicates", () => {
    const series = fillDailySeries(from, to, [
      { day: "2026-09-30", clicks: 9 },
      { day: "2026-10-03", clicks: 1 },
      { day: "2026-10-03", clicks: 2 },
      { day: "2026-10-04", clicks: 9 },
    ]);
    expect(series.map((d) => d.clicks)).toEqual([0, 0, 3]);
  });

  it("crosses month and leap-day boundaries", () => {
    const series = fillDailySeries(new Date("2028-02-28T00:00:00Z"), new Date("2028-03-02T00:00:00Z"), []);
    expect(series.map((d) => d.date)).toEqual(["2028-02-28", "2028-02-29", "2028-03-01"]);
  });

  it("is empty for an empty range", () => {
    expect(fillDailySeries(to, to, [])).toEqual([]);
  });
});

describe("startOfUtcDay", () => {
  it("truncates to midnight UTC", () => {
    expect(startOfUtcDay(new Date("2026-10-08T23:59:59.999Z")).toISOString()).toBe("2026-10-08T00:00:00.000Z");
  });
});
