/**
 * Link creation policy, independent of HTTP and storage.
 *
 * - A caller-chosen slug either wins or is reported as taken.
 * - A generated slug is retried on collision a bounded number of times.
 *   With 62^7 ≈ 3.5e12 possibilities a collision is vanishingly rare, so
 *   exhausting retries indicates a bug (or a broken RNG), not bad luck,
 *   and surfaces as an error rather than a silent loop.
 */
import { randomInt } from "node:crypto";
import { isValidSlug, type ParsedCreateLinkRequest } from "@linkshort/shared";
import type { InsertLinkResult, LinkRepository } from "./repository.ts";

export const SLUG_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export const GENERATED_SLUG_LENGTH = 7;
export const MAX_GENERATION_ATTEMPTS = 5;

/** Uniform integer in `[0, max)`. Injected so slug generation is deterministic in tests. */
export type RandomInt = (max: number) => number;

/** Generates a slug of `length` characters drawn uniformly from {@link SLUG_ALPHABET}. */
export function generateSlug(length = GENERATED_SLUG_LENGTH, rand: RandomInt = randomInt): string {
  let slug = "";
  for (let i = 0; i < length; i += 1) slug += SLUG_ALPHABET[rand(SLUG_ALPHABET.length)];
  return slug;
}

export class SlugGenerationExhaustedError extends Error {
  override readonly name = "SlugGenerationExhaustedError";
}

export async function createLink(
  repo: LinkRepository,
  input: ParsedCreateLinkRequest,
  rand: RandomInt = randomInt,
): Promise<InsertLinkResult> {
  if (input.slug !== undefined) return repo.insert({ slug: input.slug, url: input.url });

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const slug = generateSlug(GENERATED_SLUG_LENGTH, rand);
    // "healthz" is 7 characters: a generated slug can (in principle) be reserved.
    if (!isValidSlug(slug)) continue;
    const result = await repo.insert({ slug, url: input.url });
    if (result.ok) return result;
  }
  throw new SlugGenerationExhaustedError(
    `could not generate a unique slug in ${MAX_GENERATION_ATTEMPTS} attempts`,
  );
}
