import { useId, useRef, useState, type FormEvent } from "react";
import { CreateLinkRequestSchema, fieldErrors, type Link } from "@linkshort/shared";
import { describeFailure, type ApiResult } from "../api.ts";

type Fields = { url?: string; slug?: string; _?: string };

/**
 * Validates with the same schema as the server for immediate feedback; the
 * server remains authoritative (e.g. for "already taken").
 *
 * Errors are tied to inputs with aria-describedby / aria-invalid, and focus
 * moves to the first invalid field on submit.
 */
export function CreateLinkForm({ onCreate }: { onCreate: (input: { url: string; slug: string }) => Promise<ApiResult<Link>> }) {
  const id = useId();
  const urlRef = useRef<HTMLInputElement>(null);
  const slugRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [slug, setSlug] = useState("");
  const [errors, setErrors] = useState<Fields>({});
  const [busy, setBusy] = useState(false);

  const focusFirstError = (e: Fields) => (e.url !== undefined ? urlRef : e.slug !== undefined ? slugRef : null)?.current?.focus();

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const local = CreateLinkRequestSchema.safeParse({ url, slug });
    if (!local.success) {
      const e = fieldErrors(local.error) as Fields;
      setErrors(e);
      focusFirstError(e);
      return;
    }
    setBusy(true);
    const result = await onCreate({ url, slug });
    setBusy(false);
    if (result.ok) {
      setErrors({});
      setUrl("");
      setSlug("");
      urlRef.current?.focus();
      return;
    }
    const failure = result.failure;
    const e: Fields =
      failure.kind === "api" && failure.error.fields !== undefined
        ? (failure.error.fields as Fields)
        : { _: describeFailure(failure) };
    setErrors(e);
    focusFirstError(e);
  };

  const describedBy = (field: "url" | "slug", hint?: string) =>
    [hint, errors[field] !== undefined ? `${id}-${field}-error` : undefined].filter(Boolean).join(" ") || undefined;

  return (
    <form className="create" onSubmit={onSubmit} noValidate aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Shorten a link</h2>

      <div className="field field-url">
        <label htmlFor={`${id}-url`}>Address to shorten</label>
        <input
          ref={urlRef}
          id={`${id}-url`}
          name="url"
          type="url"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          placeholder="https://"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-invalid={errors.url !== undefined}
          aria-describedby={describedBy("url")}
          required
        />
        {errors.url !== undefined && (
          <p id={`${id}-url-error`} className="field-error">{errors.url}</p>
        )}
      </div>

      <div className="field field-slug">
        <label htmlFor={`${id}-slug`}>Custom short name <span className="optional">(optional)</span></label>
        <input
          ref={slugRef}
          id={`${id}-slug`}
          name="slug"
          type="text"
          autoCapitalize="off"
          autoComplete="off"
          spellCheck={false}
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          aria-invalid={errors.slug !== undefined}
          aria-describedby={describedBy("slug", `${id}-slug-hint`)}
        />
        <p id={`${id}-slug-hint`} className="field-hint">Letters, numbers, hyphens or underscores. Leave blank to generate one.</p>
        {errors.slug !== undefined && (
          <p id={`${id}-slug-error`} className="field-error">{errors.slug}</p>
        )}
      </div>

      <div className="actions">
        <button type="submit" className="button button-primary" disabled={busy} aria-disabled={busy}>
          {busy ? "Creating…" : "Create short link"}
        </button>
      </div>
      {errors._ !== undefined && <p className="form-error" role="alert">{errors._}</p>}
    </form>
  );
}
