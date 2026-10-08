/**
 * Migration entrypoint, run as a one-shot Compose service.
 *
 * Its exit code is the readiness signal for the app: the `app` service
 * depends on `condition: service_completed_successfully`, which keys off the
 * main process exit status (unaffected by the cloud sandbox `exec` issue).
 *
 * A session-level advisory lock serialises concurrent runners (e.g. two
 * stacks pointed at one database), so migrations never interleave. The lock
 * is tied to the single connection used for migrating, which is why this uses
 * a `Client` rather than a pool.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { waitForOrThrow } from "@linkshort/shared/wait-for";
import { parseConfig } from "./config.ts";
import { postgresProbe } from "./db/client.ts";

/** Arbitrary but fixed 64-bit key identifying "linkshort schema migrations". */
const MIGRATION_LOCK_KEY = 7_265_100_001n;

async function main(): Promise<void> {
  const config = parseConfig(process.env);

  await waitForOrThrow(postgresProbe(config.databaseUrl), {
    name: "postgres",
    timeoutMs: config.dbReadyTimeoutMs,
    onRetry: ({ attempt, error, delayMs }) =>
      console.warn(JSON.stringify({ msg: "waiting for postgres", attempt, error, delayMs })),
  });

  const client = new pg.Client({ connectionString: config.databaseUrl });
  await client.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK_KEY.toString()]);
    try {
      await migrate(drizzle(client), { migrationsFolder: config.migrationsDir });
    } finally {
      await client.query("select pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY.toString()]);
    }
  } finally {
    await client.end();
  }
  console.log(JSON.stringify({ msg: "migrations applied", dir: config.migrationsDir }));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
