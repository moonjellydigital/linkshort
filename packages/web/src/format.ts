/**
 * Pure presentation helpers. Locale and "now" are parameters so output is
 * deterministic in tests and consistent within a render.
 */

/** Absolute short URL for `slug` on `origin` (e.g. `window.location.origin`). */
export function shortUrl(origin: string, slug: string): string {
  return `${origin.replace(/\/+$/, "")}/${encodeURIComponent(slug)}`;
}

/** Compact, human-readable form of a URL: no scheme, no lone trailing slash. */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/^([^/?#]+)\/$/, "$1");
}

export function formatCount(n: number, locale?: string): string {
  return new Intl.NumberFormat(locale).format(n);
}

/** Label for a UTC calendar day (`YYYY-MM-DD`), e.g. "Thu, Oct 8". */
export function formatUtcDay(day: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

const UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "just now", "5 minutes ago", "yesterday", … relative to `now`. */
export function formatRelative(iso: string, now: Date, locale?: string): string {
  const seconds = Math.round((new Date(iso).getTime() - now.getTime()) / 1000);
  if (Math.abs(seconds) < 45) return "just now";
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(Math.round(seconds / 60), "minute");
}

/** Bar length as a percentage of the busiest day; 0 when there were no clicks. */
export function barPercent(clicks: number, max: number): number {
  if (max <= 0 || clicks <= 0) return 0;
  return Math.min(100, (clicks / max) * 100);
}
