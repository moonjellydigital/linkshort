import { useEffect, useState } from "react";
import { DEFAULT_STATS_DAYS, type LinkStats } from "@linkshort/shared";
import { api, describeFailure } from "../api.ts";
import { barPercent, formatCount, formatUtcDay } from "../format.ts";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; stats: LinkStats };

/**
 * Daily clicks as a list: each day's count is real text, and the bar is a
 * decorative (aria-hidden) reading aid, so nothing depends on seeing it.
 */
export function DailyClicks({ slug, id }: { slug: string; id: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    void api.linkStats(slug, DEFAULT_STATS_DAYS, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setState(result.ok ? { status: "ready", stats: result.value } : { status: "error", message: describeFailure(result.failure) });
    });
    return () => controller.abort();
  }, [slug]);

  if (state.status === "loading") return <p id={id} className="daily-status">Loading daily clicks…</p>;
  if (state.status === "error") return <p id={id} className="daily-status field-error">{state.message}</p>;

  const max = Math.max(0, ...state.stats.days.map((d) => d.clicks));
  return (
    <div id={id} className="daily">
      <h3 className="daily-title">Clicks per day, last {state.stats.days.length} days (UTC)</h3>
      <ol className="daily-list">
        {state.stats.days.map((day) => (
          <li key={day.date} className="daily-row" data-date={day.date}>
            <span className="daily-date">{formatUtcDay(day.date)}</span>
            <span className="daily-bar" aria-hidden="true">
              <span style={{ inlineSize: `${barPercent(day.clicks, max)}%` }} />
            </span>
            <span className="daily-count">
              {formatCount(day.clicks)}
              <span className="visually-hidden"> {day.clicks === 1 ? "click" : "clicks"}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
