/**
 * Postgres {@link LinkRepository} built on Drizzle.
 */
import { and, count, desc, eq, gte, lt, max, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type pg from "pg";
import type { DayCount, InsertLinkResult, LinkRecord, LinkRepository } from "../repository.ts";
import * as schema from "./schema.ts";

const { links, clicks } = schema;

export class DrizzleLinkRepository implements LinkRepository {
  readonly #db: NodePgDatabase<typeof schema>;
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
    this.#db = drizzle(pool, { schema });
  }

  async insert({ slug, url }: { slug: string; url: string }): Promise<InsertLinkResult> {
    // ON CONFLICT DO NOTHING turns a uniqueness race into an empty result
    // rather than an exception, so "taken" is decided by the database alone.
    const rows = await this.#db
      .insert(links)
      .values({ slug, url })
      .onConflictDoNothing({ target: links.slug })
      .returning();
    const row = rows[0];
    if (row === undefined) return { ok: false, reason: "slug_taken" };
    return { ok: true, link: { ...row, clickCount: 0, lastClickedAt: null } };
  }

  async list(limit: number): Promise<LinkRecord[]> {
    // Aggregate clicks in a subquery first so the join is one row per link.
    const stats = this.#db
      .select({
        linkId: clicks.linkId,
        clickCount: count().as("click_count"),
        lastClickedAt: max(clicks.clickedAt).as("last_clicked_at"),
      })
      .from(clicks)
      .groupBy(clicks.linkId)
      .as("stats");

    const rows = await this.#db
      .select({
        id: links.id,
        slug: links.slug,
        url: links.url,
        createdAt: links.createdAt,
        clickCount: sql<number>`coalesce(${stats.clickCount}, 0)`.mapWith(Number),
        lastClickedAt: stats.lastClickedAt,
      })
      .from(links)
      .leftJoin(stats, eq(stats.linkId, links.id))
      .orderBy(desc(links.createdAt), desc(links.id))
      .limit(limit);

    return rows.map((r) => ({ ...r, lastClickedAt: toDateOrNull(r.lastClickedAt) }));
  }

  async recordClick(slug: string, at: Date): Promise<string | null> {
    // One statement: lookup and append are atomic, and a missing slug inserts nothing.
    const result = await this.#db.execute<{ url: string }>(sql`
      with target as (
        select ${links.id} as id, ${links.url} as url from ${links} where ${links.slug} = ${slug}
      ), recorded as (
        insert into ${clicks} (link_id, clicked_at) select id, ${at} from target
      )
      select url from target
    `);
    return result.rows[0]?.url ?? null;
  }

  async clicksByDay(slug: string, from: Date, to: Date): Promise<DayCount[] | null> {
    const link = await this.#db.query.links.findFirst({
      columns: { id: true },
      where: eq(links.slug, slug),
    });
    if (link === undefined) return null;

    // Bucket explicitly in UTC so the result doesn't depend on the session time zone.
    const day = sql<string>`to_char(${clicks.clickedAt} at time zone 'UTC', 'YYYY-MM-DD')`;
    const rows = await this.#db
      .select({ day, clicks: count() })
      .from(clicks)
      .where(and(eq(clicks.linkId, link.id), gte(clicks.clickedAt, from), lt(clicks.clickedAt, to)))
      .groupBy(day);
    return rows.map((r) => ({ day: r.day, clicks: Number(r.clicks) }));
  }

  async ping(): Promise<void> {
    await this.#pool.query("select 1");
  }
}

/**
 * Aliased aggregates in a subquery lose their column's driver mapping, so pg
 * returns the raw text for `max(timestamptz)`. Normalise here.
 */
function toDateOrNull(value: Date | string | null): Date | null {
  if (value === null) return null;
  return value instanceof Date ? value : new Date(value);
}
