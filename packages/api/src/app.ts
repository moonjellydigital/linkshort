/**
 * HTTP application factory.
 *
 * `buildApp` wires routes to an injected {@link LinkRepository} and clock and
 * performs no I/O of its own, so tests drive it with `app.inject()` and an
 * in-memory repository.
 *
 * Route map:
 *   GET  /healthz                 liveness: the process is serving HTTP
 *   GET  /readyz                  readiness: the database answers queries
 *   GET  /api/links               recent links with click totals
 *   POST /api/links               create a link (custom or generated slug)
 *   GET  /api/links/:slug/stats   zero-filled daily clicks (UTC)
 *   GET  /                        web client (when a static dir is configured)
 *   GET  /assets/*                web client assets
 *   GET  /:slug                   302 to the target URL, recording a click
 */
import path from "node:path";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyServerOptions } from "fastify";
import {
  CreateLinkRequestSchema,
  fieldErrors,
  isValidSlug,
  ListQuerySchema,
  StatsQuerySchema,
  type ApiError,
  type ApiErrorCode,
  type Link,
  type LinkList,
  type LinkStats,
} from "@linkshort/shared";
import { createLink } from "./links-service.ts";
import type { LinkRecord, LinkRepository } from "./repository.ts";
import { fillDailySeries, trailingUtcDays } from "./stats.ts";

export interface AppDependencies {
  readonly repo: LinkRepository;
  /** Absolute path to the built web client; omit to serve the API only. */
  readonly staticDir?: string | undefined;
  readonly now?: () => Date;
  /** Fastify logger options; defaults to disabled (tests). */
  readonly logger?: FastifyServerOptions["logger"];
}

export function toWire(link: LinkRecord): Link {
  return {
    id: link.id,
    slug: link.slug,
    url: link.url,
    createdAt: link.createdAt.toISOString(),
    clickCount: link.clickCount,
    lastClickedAt: link.lastClickedAt?.toISOString() ?? null,
  };
}

function sendError(
  reply: FastifyReply,
  status: number,
  code: ApiErrorCode,
  message: string,
  fields?: Record<string, string>,
): FastifyReply {
  const body: ApiError = { error: { code, message, ...(fields === undefined ? {} : { fields }) } };
  return reply.code(status).send(body);
}

export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const { repo, staticDir } = deps;
  const now = deps.now ?? (() => new Date());

  const app = Fastify({
    logger: deps.logger ?? false,
    // Behind Compose or a sandbox port forward there's no trusted proxy chain.
    trustProxy: false,
    bodyLimit: 16 * 1024,
  });

  // Normalise framework errors (malformed JSON, oversized body, …) to the API error shape.
  app.setErrorHandler((error: { statusCode?: number; message?: string }, request, reply) => {
    const status = error.statusCode ?? 500;
    if (status >= 500) {
      request.log.error({ err: error }, "unhandled error");
      return sendError(reply, 500, "internal", "Something went wrong on the server.");
    }
    return sendError(reply, status, "invalid_request", error.message ?? "Invalid request.");
  });

  app.setNotFoundHandler((request, reply) =>
    request.url.startsWith("/api/")
      ? sendError(reply, 404, "not_found", "No such endpoint.")
      : reply.code(404).type("text/plain; charset=utf-8").send("Not found"),
  );

  app.get("/healthz", async () => ({ status: "ok" }));

  app.get("/readyz", async (request, reply) => {
    try {
      await repo.ping();
      return { status: "ready" };
    } catch (error) {
      request.log.warn({ err: error }, "readiness check failed");
      return sendError(reply, 503, "not_ready", "The database is not reachable.");
    }
  });

  app.get("/api/links", async (request, reply) => {
    const query = ListQuerySchema.safeParse(request.query);
    if (!query.success) {
      return sendError(reply, 400, "invalid_request", "Invalid query.", fieldErrors(query.error));
    }
    const body: LinkList = { links: (await repo.list(query.data.limit)).map(toWire) };
    return body;
  });

  app.post("/api/links", async (request, reply) => {
    const parsed = CreateLinkRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return sendError(reply, 400, "invalid_request", "Check the highlighted fields.", fieldErrors(parsed.error));
    }
    const result = await createLink(repo, parsed.data);
    if (!result.ok) {
      return sendError(reply, 409, "slug_taken", "That short name is already in use.", {
        slug: "That short name is already in use. Choose a different one.",
      });
    }
    return reply.code(201).header("location", `/api/links/${result.link.slug}`).send(toWire(result.link));
  });

  app.get<{ Params: { slug: string } }>("/api/links/:slug/stats", async (request, reply) => {
    const query = StatsQuerySchema.safeParse(request.query);
    if (!query.success) {
      return sendError(reply, 400, "invalid_request", "Invalid query.", fieldErrors(query.error));
    }
    const { slug } = request.params;
    const { from, to } = trailingUtcDays(now(), query.data.days);
    const counts = isValidSlug(slug) ? await repo.clicksByDay(slug, from, to) : null;
    if (counts === null) return sendError(reply, 404, "not_found", "No link with that short name.");
    const body: LinkStats = { slug, days: fillDailySeries(from, to, counts) };
    return body;
  });

  if (staticDir !== undefined) {
    await app.register(fastifyStatic, {
      // Vite emits hashed files into <dist>/assets. Only /assets/* is file-served;
      // every other single-segment path is treated as a slug.
      root: path.join(staticDir, "assets"),
      prefix: "/assets/",
      index: false,
      wildcard: true,
      immutable: true,
      maxAge: "365d",
    });
    // index.html is not hashed, so it must always be revalidated.
    app.get("/", async (_request, reply) =>
      reply.header("cache-control", "no-cache").sendFile("index.html", staticDir, { cacheControl: false }),
    );
  }

  app.get<{ Params: { slug: string } }>("/:slug", async (request, reply) => {
    const { slug } = request.params;
    const target = isValidSlug(slug) ? await repo.recordClick(slug, now()) : null;
    if (target === null) return reply.code(404).type("text/plain; charset=utf-8").send("Not found");
    // 302 rather than 301: a permanent redirect is cached by browsers, which
    // would bypass the server and lose every subsequent click.
    return reply.header("cache-control", "no-store").redirect(target, 302);
  });

  return app;
}
