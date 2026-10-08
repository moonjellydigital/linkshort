import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiErrorSchema, LinkListSchema, LinkSchema, LinkStatsSchema } from "@linkshort/shared";
import { buildApp } from "./app.ts";
import { MemoryLinkRepository } from "./memory-repository.ts";

const NOW = new Date("2026-10-08T12:00:00Z");

let repo: MemoryLinkRepository;
let app: FastifyInstance;

beforeEach(async () => {
  repo = new MemoryLinkRepository(() => NOW);
  app = await buildApp({ repo, now: () => NOW });
});
afterEach(async () => {
  await app.close();
});

const create = (body: unknown) => app.inject({ method: "POST", url: "/api/links", payload: body as object });

describe("health endpoints", () => {
  it("/healthz is independent of the database", async () => {
    repo.setReady(false);
    expect((await app.inject("/healthz")).statusCode).toBe(200);
  });

  it("/readyz reflects the database", async () => {
    expect((await app.inject("/readyz")).statusCode).toBe(200);
    repo.setReady(false);
    const res = await app.inject("/readyz");
    expect(res.statusCode).toBe(503);
    expect(ApiErrorSchema.parse(res.json()).error.code).toBe("not_ready");
  });
});

describe("POST /api/links", () => {
  it("creates a link with a generated slug and returns the contract shape", async () => {
    const res = await create({ url: "https://example.com/a" });
    expect(res.statusCode).toBe(201);
    const link = LinkSchema.parse(res.json());
    expect(link.slug).toMatch(/^[0-9A-Za-z]{7}$/);
    expect(res.headers.location).toBe(`/api/links/${link.slug}`);
    expect(link).toMatchObject({ url: "https://example.com/a", clickCount: 0, lastClickedAt: null });
  });

  it("returns field errors for invalid input", async () => {
    const res = await create({ url: "notaurl", slug: "a b" });
    expect(res.statusCode).toBe(400);
    const { error } = ApiErrorSchema.parse(res.json());
    expect(error.code).toBe("invalid_request");
    expect(Object.keys(error.fields ?? {}).sort()).toEqual(["slug", "url"]);
  });

  it("returns 409 with a slug field error when the slug is taken", async () => {
    await create({ url: "https://a.example", slug: "taken" });
    const res = await create({ url: "https://b.example", slug: "taken" });
    expect(res.statusCode).toBe(409);
    const { error } = ApiErrorSchema.parse(res.json());
    expect(error.code).toBe("slug_taken");
    expect(error.fields?.slug).toBeDefined();
  });

  it("normalises malformed JSON to the API error shape", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/links",
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });
    expect(res.statusCode).toBe(400);
    expect(ApiErrorSchema.parse(res.json()).error.code).toBe("invalid_request");
  });

  it("treats a missing body as invalid input, not a server error", async () => {
    const res = await app.inject({ method: "POST", url: "/api/links" });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /:slug", () => {
  it("redirects with 302, forbids caching, and records the click", async () => {
    await create({ url: "https://example.com/target", slug: "goto" });
    const res = await app.inject("/goto");
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("https://example.com/target");
    expect(res.headers["cache-control"]).toBe("no-store");

    const list = LinkListSchema.parse((await app.inject("/api/links")).json());
    expect(list.links[0]).toMatchObject({ slug: "goto", clickCount: 1, lastClickedAt: NOW.toISOString() });
  });

  it.each(["/nope", "/a.b", "/api", "/x"])("404s for %s without recording anything", async (url) => {
    expect((await app.inject(url)).statusCode).toBe(404);
  });

  it("does not route reserved paths as slugs", async () => {
    expect((await app.inject("/healthz")).json()).toEqual({ status: "ok" });
  });
});

describe("GET /api/links/:slug/stats", () => {
  it("returns a zero-filled series ending today", async () => {
    await create({ url: "https://example.com", slug: "stat" });
    await app.inject("/stat");
    await app.inject("/stat");
    const res = await app.inject("/api/links/stat/stats?days=3");
    expect(res.statusCode).toBe(200);
    expect(LinkStatsSchema.parse(res.json())).toEqual({
      slug: "stat",
      days: [
        { date: "2026-10-06", clicks: 0 },
        { date: "2026-10-07", clicks: 0 },
        { date: "2026-10-08", clicks: 2 },
      ],
    });
  });

  it("404s for an unknown link", async () => {
    const res = await app.inject("/api/links/missing/stats");
    expect(res.statusCode).toBe(404);
    expect(ApiErrorSchema.parse(res.json()).error.code).toBe("not_found");
  });

  it("400s for an out-of-range window", async () => {
    await create({ url: "https://example.com", slug: "stat" });
    expect((await app.inject("/api/links/stat/stats?days=0")).statusCode).toBe(400);
  });
});

describe("unknown API routes", () => {
  it("return the JSON error shape", async () => {
    const res = await app.inject("/api/nope");
    expect(res.statusCode).toBe(404);
    expect(ApiErrorSchema.parse(res.json()).error.code).toBe("not_found");
  });
});

describe("static web client", () => {
  it("serves index.html at / and hashed assets under /assets", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "linkshort-static-"));
    await mkdir(path.join(dir, "assets"));
    await writeFile(path.join(dir, "index.html"), "<!doctype html><title>t</title>");
    await writeFile(path.join(dir, "assets", "app-abc123.js"), "console.log(1)");

    const withUi = await buildApp({ repo, staticDir: dir, now: () => NOW });
    try {
      const index = await withUi.inject("/");
      expect(index.statusCode).toBe(200);
      expect(index.headers["cache-control"]).toBe("no-cache");
      const asset = await withUi.inject("/assets/app-abc123.js");
      expect(asset.statusCode).toBe(200);
      expect(asset.headers["cache-control"]).toContain("immutable");
      // Files outside /assets are not exposed, and /index.html is not a slug.
      expect((await withUi.inject("/index.html")).statusCode).toBe(404);
    } finally {
      await withUi.close();
    }
  });
});
