/**
 * In-memory {@link LinkRepository}. Used for HTTP-layer unit tests; it is held
 * to the same contract suite as the Postgres implementation so the two can't
 * silently diverge.
 */
import type { DayCount, InsertLinkResult, LinkRecord, LinkRepository } from "./repository.ts";
import { utcDayKey } from "./stats.ts";

interface StoredLink {
  readonly id: number;
  readonly slug: string;
  readonly url: string;
  readonly createdAt: Date;
  readonly clicks: Date[];
}

export class MemoryLinkRepository implements LinkRepository {
  readonly #bySlug = new Map<string, StoredLink>();
  #nextId = 1;
  #ready = true;

  readonly #now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this.#now = now;
  }

  /** Test hook: makes {@link ping} fail, simulating an unavailable database. */
  setReady(ready: boolean): void {
    this.#ready = ready;
  }

  async insert({ slug, url }: { slug: string; url: string }): Promise<InsertLinkResult> {
    if (this.#bySlug.has(slug)) return { ok: false, reason: "slug_taken" };
    const stored: StoredLink = { id: this.#nextId++, slug, url, createdAt: this.#now(), clicks: [] };
    this.#bySlug.set(slug, stored);
    return { ok: true, link: toRecord(stored) };
  }

  async list(limit: number): Promise<LinkRecord[]> {
    return [...this.#bySlug.values()]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id)
      .slice(0, limit)
      .map(toRecord);
  }

  async recordClick(slug: string, at: Date): Promise<string | null> {
    const stored = this.#bySlug.get(slug);
    if (stored === undefined) return null;
    stored.clicks.push(at);
    return stored.url;
  }

  async clicksByDay(slug: string, from: Date, to: Date): Promise<DayCount[] | null> {
    const stored = this.#bySlug.get(slug);
    if (stored === undefined) return null;
    const counts = new Map<string, number>();
    for (const at of stored.clicks) {
      if (at >= from && at < to) counts.set(utcDayKey(at), (counts.get(utcDayKey(at)) ?? 0) + 1);
    }
    return [...counts].map(([day, clicks]) => ({ day, clicks }));
  }

  async ping(): Promise<void> {
    if (!this.#ready) throw new Error("memory repository marked not ready");
  }
}

function toRecord(s: StoredLink): LinkRecord {
  const last = s.clicks.reduce<Date | null>((max, at) => (max === null || at > max ? at : max), null);
  return { id: s.id, slug: s.slug, url: s.url, createdAt: s.createdAt, clickCount: s.clicks.length, lastClickedAt: last };
}
