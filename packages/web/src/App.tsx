import { useCallback, useEffect, useState } from "react";
import type { Link } from "@linkshort/shared";
import { api, describeFailure, type ApiResult } from "./api.ts";
import { AnnouncerProvider, useAnnounce } from "./announcer.tsx";
import { CreateLinkForm } from "./components/CreateLinkForm.tsx";
import { LinksTable } from "./components/LinksTable.tsx";
import { Ticket } from "./components/Ticket.tsx";
import { shortUrl } from "./format.ts";

type ListState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; links: Link[]; loadedAt: Date };

function Dashboard() {
  const announce = useAnnounce();
  const origin = window.location.origin;
  const [list, setList] = useState<ListState>({ status: "loading" });
  const [latest, setLatest] = useState<Link | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const result = await api.listLinks(signal);
    if (signal?.aborted) return;
    setList(
      result.ok
        ? { status: "ready", links: result.value.links, loadedAt: new Date() }
        : { status: "error", message: describeFailure(result.failure) },
    );
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const onCreate = async (input: { url: string; slug: string }): Promise<ApiResult<Link>> => {
    const result = await api.createLink(input);
    if (result.ok) {
      setLatest(result.value);
      announce(`Short link created: ${shortUrl(origin, result.value.slug)}`);
      void load();
    }
    return result;
  };

  const refresh = async () => {
    await load();
    announce("Links refreshed");
  };

  return (
    <>
      <header className="masthead">
        <h1 className="wordmark">linkshort</h1>
      </header>
      <main id="main" className="page">
        <CreateLinkForm onCreate={onCreate} />
        {latest !== null && <Ticket link={latest} origin={origin} />}

        <section className="list" aria-labelledby="list-title">
          <div className="list-head">
            <h2 id="list-title">Your links</h2>
            <button type="button" className="button button-quiet" onClick={refresh}>
              Refresh
            </button>
          </div>
          {list.status === "loading" && <p className="muted">Loading links…</p>}
          {list.status === "error" && (
            <div className="load-error" role="alert">
              <p>{list.message}</p>
              <button type="button" className="button button-quiet" onClick={() => void load()}>
                Try again
              </button>
            </div>
          )}
          {list.status === "ready" && <LinksTable links={list.links} origin={origin} now={list.loadedAt} />}
        </section>
      </main>
    </>
  );
}

export function App() {
  return (
    <AnnouncerProvider>
      <Dashboard />
    </AnnouncerProvider>
  );
}
