import type { Link } from "@linkshort/shared";
import { displayUrl, shortUrl } from "../format.ts";
import { CopyButton } from "./CopyButton.tsx";

/** The most recently created link, presented as a ticket stub. */
export function Ticket({ link, origin }: { link: Link; origin: string }) {
  const href = shortUrl(origin, link.slug);
  return (
    <section className="ticket" aria-labelledby="ticket-title" data-testid="ticket">
      <div className="ticket-stub" aria-hidden="true" />
      <div className="ticket-body">
        <h2 id="ticket-title" className="ticket-title">Your short link</h2>
        <p className="ticket-link">
          <a href={href}>{displayUrl(href)}</a>
        </p>
        <p className="ticket-dest">
          Goes to <span className="dest">{displayUrl(link.url)}</span>
        </p>
      </div>
      <div className="ticket-action">
        <CopyButton text={href} label={`Copy short link ${href}`} />
      </div>
    </section>
  );
}
