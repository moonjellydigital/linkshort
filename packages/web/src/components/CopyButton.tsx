import { useAnnounce } from "../announcer.tsx";

/**
 * The Clipboard API exists only in secure contexts. Over plain http on a
 * non-localhost host (e.g. http://app:3000 inside Compose) it is undefined,
 * so the button says so instead of failing silently.
 */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const announce = useAnnounce();
  const onClick = async () => {
    if (!window.isSecureContext || navigator.clipboard === undefined) {
      announce("Copying isn't available on this connection. Select the link text to copy it.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      announce(`Copied ${text}`);
    } catch {
      announce("Couldn't copy. Select the link text to copy it.");
    }
  };
  return (
    <button type="button" className="button button-quiet" onClick={onClick} aria-label={label}>
      Copy
    </button>
  );
}
