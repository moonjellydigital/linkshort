/**
 * Pure helpers for the daily click series. All calendar arithmetic is in UTC
 * so results don't depend on the server's or database session's time zone.
 */
import type { DailyClicks } from "@linkshort/shared";
import type { DayCount } from "./repository.ts";

const DAY_MS = 86_400_000;

/** Midnight UTC at the start of the day containing `at`. */
export function startOfUtcDay(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

/** `YYYY-MM-DD` for the UTC day containing `at`. */
export function utcDayKey(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * The half-open range `[from, to)` covering the last `days` UTC days,
 * ending with (and including) the day containing `now`.
 */
export function trailingUtcDays(now: Date, days: number): { from: Date; to: Date } {
  if (!Number.isInteger(days) || days < 1) throw new RangeError(`days must be >= 1, got ${days}`);
  const to = new Date(startOfUtcDay(now).getTime() + DAY_MS);
  return { from: new Date(to.getTime() - days * DAY_MS), to };
}

/**
 * Expands sparse per-day counts into a dense, oldest-first series with one
 * entry per day in `[from, to)`. Counts for days outside the range are
 * ignored; duplicate keys are summed.
 */
export function fillDailySeries(from: Date, to: Date, counts: readonly DayCount[]): DailyClicks[] {
  const byDay = new Map<string, number>();
  for (const { day, clicks } of counts) byDay.set(day, (byDay.get(day) ?? 0) + clicks);

  const series: DailyClicks[] = [];
  for (let t = startOfUtcDay(from).getTime(); t < to.getTime(); t += DAY_MS) {
    const date = utcDayKey(new Date(t));
    series.push({ date, clicks: byDay.get(date) ?? 0 });
  }
  return series;
}
