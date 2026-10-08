/**
 * Persistence boundary.
 *
 * Route handlers depend on this interface, not on Drizzle, so the HTTP layer
 * is unit-testable against {@link MemoryLinkRepository} and the Postgres
 * implementation is tested separately against a real database. Both
 * implementations must satisfy the same contract suite
 * (`repository.contract.ts`).
 *
 * Domain values use `Date`; serialisation to the wire format happens in the
 * HTTP layer only.
 */

export interface LinkRecord {
  readonly id: number;
  readonly slug: string;
  readonly url: string;
  readonly createdAt: Date;
  readonly clickCount: number;
  readonly lastClickedAt: Date | null;
}

export type InsertLinkResult =
  | { readonly ok: true; readonly link: LinkRecord }
  | { readonly ok: false; readonly reason: "slug_taken" };

/** Click counts for one UTC day, as stored (days without clicks are absent). */
export interface DayCount {
  /** `YYYY-MM-DD`, UTC. */
  readonly day: string;
  readonly clicks: number;
}

export interface LinkRepository {
  /** Inserts a link; reports a slug collision as a value, never as a thrown error. */
  insert(input: { slug: string; url: string }): Promise<InsertLinkResult>;

  /** Most recently created first (ties broken by id, descending). */
  list(limit: number): Promise<LinkRecord[]>;

  /**
   * Atomically looks up `slug` and records a click at `at`.
   * Returns the target URL, or `null` (and records nothing) if no such link.
   */
  recordClick(slug: string, at: Date): Promise<string | null>;

  /**
   * Click counts per UTC day in `[from, to)` for `slug`, or `null` if the
   * link doesn't exist. Days with zero clicks may be omitted.
   */
  clicksByDay(slug: string, from: Date, to: Date): Promise<DayCount[] | null>;

  /** Resolves if the backing store can serve queries. Used by `/readyz`. */
  ping(): Promise<void>;
}
