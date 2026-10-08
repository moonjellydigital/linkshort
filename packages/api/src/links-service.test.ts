import { describe, expect, it } from "vitest";
import {
  createLink,
  generateSlug,
  GENERATED_SLUG_LENGTH,
  MAX_GENERATION_ATTEMPTS,
  SLUG_ALPHABET,
  SlugGenerationExhaustedError,
  type RandomInt,
} from "./links-service.ts";
import { MemoryLinkRepository } from "./memory-repository.ts";

/** RNG replaying a fixed sequence of alphabet indices. */
function sequence(...indices: number[]): RandomInt {
  let i = 0;
  return (max) => {
    const value = indices[i++ % indices.length] ?? 0;
    if (value >= max) throw new RangeError("index out of range");
    return value;
  };
}

/** RNG producing the given strings, one per generated slug. */
const spelling = (...slugs: string[]): RandomInt =>
  sequence(...slugs.flatMap((s) => [...s].map((c) => SLUG_ALPHABET.indexOf(c))));

describe("generateSlug", () => {
  it("draws each character from the alphabet", () => {
    expect(generateSlug(4, sequence(0, 10, 36, 61))).toBe("0Aaz");
  });

  it("defaults to the configured length using crypto randomness", () => {
    const slug = generateSlug();
    expect(slug).toHaveLength(GENERATED_SLUG_LENGTH);
    expect([...slug].every((c) => SLUG_ALPHABET.includes(c))).toBe(true);
  });
});

describe("createLink", () => {
  it("uses a custom slug verbatim", async () => {
    const result = await createLink(new MemoryLinkRepository(), { url: "https://x.example", slug: "mine" });
    expect(result.ok && result.link.slug).toBe("mine");
  });

  it("does not retry a taken custom slug", async () => {
    const repo = new MemoryLinkRepository();
    await repo.insert({ slug: "mine", url: "https://a.example" });
    expect(await createLink(repo, { url: "https://b.example", slug: "mine" })).toEqual({
      ok: false,
      reason: "slug_taken",
    });
  });

  it("retries a generated slug on collision", async () => {
    const repo = new MemoryLinkRepository();
    await repo.insert({ slug: "AAAAAAA", url: "https://a.example" });
    const result = await createLink(repo, { url: "https://b.example" }, spelling("AAAAAAA", "BBBBBBB"));
    expect(result.ok && result.link.slug).toBe("BBBBBBB");
  });

  it("never generates a reserved slug", async () => {
    const result = await createLink(new MemoryLinkRepository(), { url: "https://b.example" }, spelling("healthz", "CCCCCCC"));
    expect(result.ok && result.link.slug).toBe("CCCCCCC");
  });

  it("fails loudly once attempts are exhausted", async () => {
    const repo = new MemoryLinkRepository();
    await repo.insert({ slug: "AAAAAAA", url: "https://a.example" });
    await expect(createLink(repo, { url: "https://b.example" }, spelling("AAAAAAA"))).rejects.toBeInstanceOf(
      SlugGenerationExhaustedError,
    );
    expect(MAX_GENERATION_ATTEMPTS).toBeGreaterThan(1);
  });
});
