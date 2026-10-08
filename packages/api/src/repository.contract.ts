/**
 * Behavioural contract every {@link LinkRepository} must satisfy. Each
 * implementation's test file calls {@link describeRepositoryContract} with a
 * factory that yields a fresh, empty repository per test.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { LinkRepository } from "./repository.ts";

export function describeRepositoryContract(
  name: string,
  fresh: () => Promise<LinkRepository>,
): void {
  describe(`LinkRepository contract: ${name}`, () => {
    let repo: LinkRepository;
    beforeEach(async () => {
      repo = await fresh();
    });

    it("inserts and returns the new link with zero clicks", async () => {
      const result = await repo.insert({ slug: "abc", url: "https://example.com" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.link).toMatchObject({ slug: "abc", url: "https://example.com", clickCount: 0, lastClickedAt: null });
      expect(result.link.id).toBeGreaterThan(0);
      expect(result.link.createdAt).toBeInstanceOf(Date);
    });

    it("reports a duplicate slug as a value, leaving the original intact", async () => {
      await repo.insert({ slug: "dup", url: "https://first.example" });
      expect(await repo.insert({ slug: "dup", url: "https://second.example" })).toEqual({
        ok: false,
        reason: "slug_taken",
      });
      expect(await repo.recordClick("dup", new Date())).toBe("https://first.example");
    });

    it("treats slugs as case-sensitive", async () => {
      await repo.insert({ slug: "Case", url: "https://upper.example" });
      expect((await repo.insert({ slug: "case", url: "https://lower.example" })).ok).toBe(true);
    });

    it("records clicks and reflects them in the list", async () => {
      await repo.insert({ slug: "hit", url: "https://example.com" });
      const t1 = new Date("2026-10-01T10:00:00Z");
      const t2 = new Date("2026-10-02T09:30:00Z");
      expect(await repo.recordClick("hit", t1)).toBe("https://example.com");
      expect(await repo.recordClick("hit", t2)).toBe("https://example.com");

      const [link] = await repo.list(10);
      expect(link?.clickCount).toBe(2);
      expect(link?.lastClickedAt?.toISOString()).toBe(t2.toISOString());
    });

    it("returns null and records nothing for an unknown slug", async () => {
      expect(await repo.recordClick("missing", new Date())).toBeNull();
      expect(await repo.clicksByDay("missing", new Date(0), new Date())).toBeNull();
    });

    it("lists newest first and honours the limit", async () => {
      for (const slug of ["one", "two", "three"]) {
        await repo.insert({ slug, url: `https://${slug}.example` });
      }
      expect((await repo.list(2)).map((l) => l.slug)).toEqual(["three", "two"]);
    });

    it("buckets clicks by UTC day within a half-open range", async () => {
      await repo.insert({ slug: "days", url: "https://example.com" });
      const at = (iso: string) => repo.recordClick("days", new Date(iso));
      await at("2026-09-30T23:59:59.999Z"); // before range
      await at("2026-10-01T00:00:00.000Z"); // first instant in range
      await at("2026-10-01T23:59:59.999Z");
      await at("2026-10-02T12:00:00.000Z");
      await at("2026-10-03T00:00:00.000Z"); // == `to`: excluded

      const counts = await repo.clicksByDay(
        "days",
        new Date("2026-10-01T00:00:00Z"),
        new Date("2026-10-03T00:00:00Z"),
      );
      expect([...(counts ?? [])].sort((a, b) => a.day.localeCompare(b.day))).toEqual([
        { day: "2026-10-01", clicks: 2 },
        { day: "2026-10-02", clicks: 1 },
      ]);
    });

    it("returns an empty (not null) series for an existing link without clicks", async () => {
      await repo.insert({ slug: "quiet", url: "https://example.com" });
      expect(await repo.clicksByDay("quiet", new Date(0), new Date())).toEqual([]);
    });

    it("pings successfully", async () => {
      await expect(repo.ping()).resolves.toBeUndefined();
    });
  });
}
