/**
 * Typed API client. Every response is validated against the shared schema,
 * and every failure is returned as a value, classified so the UI can say
 * something specific:
 *   - "api":      the server answered with the documented error shape
 *   - "network":  no answer (server down, connection refused, aborted)
 *   - "contract": an answer that doesn't match the schema (version skew, bug)
 */
import type { z } from "zod";
import {
  ApiErrorSchema,
  LinkListSchema,
  LinkSchema,
  LinkStatsSchema,
  type ApiError,
  type CreateLinkRequest,
  type Link,
  type LinkStats,
} from "@linkshort/shared";

export type ApiFailure =
  | { readonly kind: "api"; readonly status: number; readonly error: ApiError["error"] }
  | { readonly kind: "network"; readonly message: string }
  | { readonly kind: "contract"; readonly message: string };

export type ApiResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: ApiFailure };

async function request<S extends z.ZodType>(
  schema: S,
  path: string,
  init?: RequestInit,
): Promise<ApiResult<z.output<S>>> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers: { accept: "application/json", ...init?.headers } });
  } catch (error) {
    return { ok: false, failure: { kind: "network", message: String(error) } };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {
      ok: false,
      failure: { kind: "contract", message: `${response.status} response was not JSON` },
    };
  }

  if (!response.ok) {
    const parsed = ApiErrorSchema.safeParse(body);
    return parsed.success
      ? { ok: false, failure: { kind: "api", status: response.status, error: parsed.data.error } }
      : { ok: false, failure: { kind: "contract", message: `unexpected ${response.status} error body` } };
  }

  const parsed = schema.safeParse(body);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, failure: { kind: "contract", message: parsed.error.message } };
}

export const api = {
  listLinks: (signal?: AbortSignal): Promise<ApiResult<{ links: Link[] }>> =>
    request(LinkListSchema, "/api/links", signal === undefined ? {} : { signal }),

  createLink: (body: CreateLinkRequest): Promise<ApiResult<Link>> =>
    request(LinkSchema, "/api/links", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),

  linkStats: (slug: string, days: number, signal?: AbortSignal): Promise<ApiResult<LinkStats>> =>
    request(
      LinkStatsSchema,
      `/api/links/${encodeURIComponent(slug)}/stats?days=${days}`,
      signal === undefined ? {} : { signal },
    ),
};

/** One sentence describing a failure, in the interface's voice. */
export function describeFailure(failure: ApiFailure): string {
  switch (failure.kind) {
    case "api":
      return failure.error.message;
    case "network":
      return "The server didn't respond. Check that it's running, then try again.";
    case "contract":
      return "The server sent a response this page doesn't understand. Reload to get the latest version.";
  }
}
