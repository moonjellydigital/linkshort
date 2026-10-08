/**
 * Database schema. The source of truth for `drizzle-kit generate`; migrations
 * in `../../drizzle` are derived from this file and committed.
 *
 * Clicks are stored as events rather than a counter column so the daily
 * series can be derived without a second write path, and so recording a
 * click is an append (no row-level contention on popular links).
 */
import { bigint, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const links = pgTable("links", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  slug: text("slug").notNull().unique("links_slug_unique"),
  url: text("url").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const clicks = pgTable(
  "clicks",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    linkId: integer("link_id")
      .notNull()
      .references(() => links.id, { onDelete: "cascade" }),
    clickedAt: timestamp("clicked_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  // Serves both the per-link aggregate in the list view and the stats range scan.
  (t) => [index("clicks_link_id_clicked_at_idx").on(t.linkId, t.clickedAt)],
);
