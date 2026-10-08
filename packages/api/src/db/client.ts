/**
 * Postgres connectivity: pool construction and the readiness probe used by
 * entrypoints before they do real work.
 */
import pg from "pg";
import type { Probe } from "@linkshort/shared/wait-for";

export function createPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    // Fail a connection attempt quickly so the readiness loop, not the driver,
    // owns the overall waiting budget.
    connectionTimeoutMillis: 3_000,
    idleTimeoutMillis: 30_000,
  });
}

/**
 * Ready means "accepts a query", not "port is open": Postgres can accept TCP
 * connections while still rejecting queries with `57P03` (starting up).
 * A fresh client per attempt avoids poisoning a pool with half-open sockets.
 */
export function postgresProbe(databaseUrl: string): Probe {
  return async () => {
    const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 3_000 });
    try {
      await client.connect();
      await client.query("select 1");
    } finally {
      await client.end().catch(() => {});
    }
  };
}
