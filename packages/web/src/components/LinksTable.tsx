import { Fragment, useState } from "react";
import type { Link } from "@linkshort/shared";
import { displayUrl, formatCount, formatRelative, shortUrl } from "../format.ts";
import { CopyButton } from "./CopyButton.tsx";
import { DailyClicks } from "./DailyClicks.tsx";

export function LinksTable({ links, origin, now }: { links: readonly Link[]; origin: string; now: Date }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (slug: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(slug)) next.add(slug);
      return next;
    });

  if (links.length === 0) {
    return <p className="empty">No short links yet. Create one above and it will appear here.</p>;
  }

  return (
    <div className="table-scroll">
      <table className="links" role="table">
        <caption className="visually-hidden">Short links, newest first</caption>
        <colgroup>
          <col className="col-slug" />
          <col className="col-dest" />
          <col className="col-clicks" />
          <col className="col-last" />
          <col className="col-actions" />
        </colgroup>
        <thead role="rowgroup">
          <tr role="row">
            <th scope="col" role="columnheader">Short link</th>
            <th scope="col" role="columnheader">Goes to</th>
            <th scope="col" role="columnheader" className="num">Clicks</th>
            <th scope="col" role="columnheader">Last clicked</th>
            <th scope="col" role="columnheader"><span className="visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {links.map((link) => {
            const href = shortUrl(origin, link.slug);
            const isOpen = open.has(link.slug);
            const panelId = `daily-${link.slug}`;
            return (
              <Fragment key={link.id}>
                <tr role="row" data-slug={link.slug}>
                  <th scope="row" role="rowheader" className="slug-cell">
                    <a href={href}>/{link.slug}</a>
                  </th>
                  <td role="cell" className="dest-cell">
                    <span className="dest" title={link.url}>{displayUrl(link.url)}</span>
                  </td>
                  <td role="cell" className="num clicks-cell">
                    <span data-testid="click-count">{formatCount(link.clickCount)}</span>
                    {/* Visible only in the stacked (narrow) layout, where column headers are hidden. */}
                    <span className="stacked-label" aria-hidden="true"> {link.clickCount === 1 ? "click" : "clicks"}</span>
                  </td>
                  <td role="cell" className="last-cell">
                    <span className="stacked-label" aria-hidden="true">Last clicked: </span>
                    {link.lastClickedAt === null ? (
                      <span className="muted">Never</span>
                    ) : (
                      <time dateTime={link.lastClickedAt}>{formatRelative(link.lastClickedAt, now)}</time>
                    )}
                  </td>
                  <td role="cell" className="actions-cell">
                    <div className="row-actions">
                    <CopyButton text={href} label={`Copy short link /${link.slug}`} />
                    <button
                      type="button"
                      className="button button-quiet"
                      aria-expanded={isOpen}
                      aria-controls={isOpen ? panelId : undefined}
                      onClick={() => toggle(link.slug)}
                    >
                      {isOpen ? "Hide daily clicks" : "Daily clicks"}
                      <span className="visually-hidden"> for /{link.slug}</span>
                    </button>
                    </div>
                  </td>
                </tr>
                {isOpen && (
                  <tr role="row" className="daily-row-wrap">
                    <td role="cell" colSpan={5}>
                      <DailyClicks slug={link.slug} id={panelId} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
