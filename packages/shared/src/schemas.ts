/**
 * Wire contracts shared by the API, the web client and the e2e suite.
 *
 * The API validates requests with these schemas and the client validates
 * responses with them, so contract drift fails loudly at the boundary instead
 * of propagating malformed data.
 */
import { z } from "zod";

/** Upper bound on stored target URLs; generous, but keeps rows bounded. */
export const MAX_URL_LENGTH = 2048;

/**
 * Custom slugs use URL-safe characters only, so a slug never needs encoding
 * and can never contain a path separator or a dot. The latter keeps slugs
 * disjoint from file-like paths such as `/favicon.ico`.
 */
export const SLUG_PATTERN = /^[A-Za-z0-9_-]{3,32}$/;

/**
 * Top-level paths owned by the application. A slug equal to one of these would
 * be shadowed by the real route, so they are rejected case-insensitively.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "api",
  "assets",
  "healthz",
  "readyz",
]);

/** Days of history the stats endpoint returns when the caller doesn't ask. */
export const DEFAULT_STATS_DAYS = 7;
export const MAX_STATS_DAYS = 90;

/** True when `value` parses as an absolute http(s) URL. */
export function isHttpUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:";
}

/** True when `value` is a syntactically valid, non-reserved slug. */
export function isValidSlug(value: string): boolean {
  return SLUG_PATTERN.test(value) && !RESERVED_SLUGS.has(value.toLowerCase());
}

export const SlugSchema = z
  .string()
  .regex(SLUG_PATTERN, "Use 3–32 letters, numbers, hyphens or underscores.")
  .refine((s) => !RESERVED_SLUGS.has(s.toLowerCase()), {
    message: "That name is reserved. Choose a different one.",
  });

export const TargetUrlSchema = z
  .string()
  .trim()
  .min(1, "Enter the address to shorten.")
  .max(MAX_URL_LENGTH, `Addresses can be at most ${MAX_URL_LENGTH} characters.`)
  .refine(isHttpUrl, "Enter a full address starting with http:// or https://.");

export const CreateLinkRequestSchema = z.object({
  url: TargetUrlSchema,
  /** Omit, or send an empty string, to have the server generate a slug. */
  slug: z
    .string()
    .trim()
    .transform((s) => (s === "" ? undefined : s))
    .pipe(SlugSchema.optional())
    .optional(),
});
/** What a client sends. */
export type CreateLinkRequest = z.input<typeof CreateLinkRequestSchema>;
/** What the server works with after normalisation (trimmed, empty slug → undefined). */
export type ParsedCreateLinkRequest = z.output<typeof CreateLinkRequestSchema>;

export const LinkSchema = z.object({
  id: z.number().int().positive(),
  slug: z.string(),
  url: z.string(),
  createdAt: z.iso.datetime({ offset: true }),
  clickCount: z.number().int().nonnegative(),
  lastClickedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type Link = z.infer<typeof LinkSchema>;

export const LinkListSchema = z.object({ links: z.array(LinkSchema) });
export type LinkList = z.infer<typeof LinkListSchema>;

export const DailyClicksSchema = z.object({
  /** UTC calendar day, `YYYY-MM-DD`. */
  date: z.iso.date(),
  clicks: z.number().int().nonnegative(),
});
export type DailyClicks = z.infer<typeof DailyClicksSchema>;

export const LinkStatsSchema = z.object({
  slug: z.string(),
  /** Oldest first, exactly one entry per UTC day, zero-filled. */
  days: z.array(DailyClicksSchema),
});
export type LinkStats = z.infer<typeof LinkStatsSchema>;

export const StatsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(MAX_STATS_DAYS).default(DEFAULT_STATS_DAYS),
});

export const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const ApiErrorCodeSchema = z.enum([
  "invalid_request",
  "slug_taken",
  "not_found",
  "not_ready",
  "internal",
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
    /** Field-level messages keyed by request property, for display beside inputs. */
    fields: z.record(z.string(), z.string()).optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/**
 * Flattens a Zod error into one message per top-level field (first issue
 * wins), which is the granularity a form can display next to each input.
 * Issues without a path are keyed under `_`.
 */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : "_";
    fields[key] ??= issue.message;
  }
  return fields;
}
