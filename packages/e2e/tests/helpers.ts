import { randomBytes } from "node:crypto";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { LinkSchema, type Link } from "@linkshort/shared";

/**
 * Tests share one database and run in parallel, so every test owns its data
 * via unique slugs and scopes assertions to its own rows.
 */
export function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomBytes(4).toString("hex")}`;
}

/** Creates a link through the public API (fast setup that doesn't re-test the form). */
export async function createLinkViaApi(request: APIRequestContext, url: string, slug: string): Promise<Link> {
  const response = await request.post("/api/links", { data: { url, slug } });
  expect(response.status()).toBe(201);
  return LinkSchema.parse(await response.json());
}

/** Hits a short link without following the redirect: no outbound network needed. */
export async function click(request: APIRequestContext, slug: string): Promise<void> {
  const response = await request.get(`/${slug}`, { maxRedirects: 0 });
  expect(response.status()).toBe(302);
}

export const linkRow = (page: Page, slug: string) => page.locator(`tr[data-slug="${slug}"]`);
