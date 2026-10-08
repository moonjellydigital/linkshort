/**
 * Server entrypoint (the container's main process).
 *
 * Waits for Postgres from inside the process rather than relying on a Docker
 * healthcheck, then serves HTTP until SIGTERM/SIGINT, draining in-flight
 * requests before closing the pool.
 */
import { waitForOrThrow } from "@linkshort/shared/wait-for";
import { buildApp } from "./app.ts";
import { parseConfig } from "./config.ts";
import { createPool, postgresProbe } from "./db/client.ts";
import { DrizzleLinkRepository } from "./db/drizzle-repository.ts";

async function main(): Promise<void> {
  const config = parseConfig(process.env);

  // Readiness is waited for before building the app so the first log line
  // after "listening" means the service is genuinely usable.
  await waitForOrThrow(postgresProbe(config.databaseUrl), {
    name: "postgres",
    timeoutMs: config.dbReadyTimeoutMs,
    onRetry: ({ attempt, error, delayMs }) =>
      console.warn(JSON.stringify({ msg: "waiting for postgres", attempt, error, delayMs })),
  });

  const pool = createPool(config.databaseUrl);
  const app = await buildApp({
    repo: new DrizzleLinkRepository(pool),
    staticDir: config.staticDir,
    logger: { level: config.logLevel },
  });

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, "shutting down");
    try {
      await app.close();
      await pool.end();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, "error during shutdown");
      process.exit(1);
    }
  };
  process.once("SIGTERM", (s) => void shutdown(s));
  process.once("SIGINT", (s) => void shutdown(s));

  await app.listen({ host: config.host, port: config.port });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
