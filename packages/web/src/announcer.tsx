/**
 * A single polite live region for the whole app. Components announce status
 * changes (created, copied, failed) here instead of each owning a region,
 * which keeps screen reader output ordered and avoids duplicate readings.
 */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type Announce = (message: string) => void;
const AnnouncerContext = createContext<Announce>(() => {});

export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const seq = useRef(0);
  const announce = useCallback<Announce>((next) => {
    // Re-announcing identical text requires the content to change first.
    seq.current += 1;
    const id = seq.current;
    setMessage("");
    queueMicrotask(() => {
      if (id === seq.current) setMessage(next);
    });
  }, []);
  return (
    <AnnouncerContext.Provider value={announce}>
      {children}
      <div role="status" aria-live="polite" aria-atomic="true" className="visually-hidden" data-testid="announcer">
        {message}
      </div>
    </AnnouncerContext.Provider>
  );
}

export const useAnnounce = (): Announce => useContext(AnnouncerContext);
