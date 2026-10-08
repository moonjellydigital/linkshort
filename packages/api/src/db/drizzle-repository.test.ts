/**
 * Runs the repository contract against real Postgres.
 *
 * Opt-in: set TEST_DATABASE_URL to a disposable database. Each test gets a
 * clean slate via TRUNCATE; migrations are applied once per run with the same
 * migrator the `migrate` service uses.
 */
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, it } from "vitest";
import { describeRepositoryContract } from "../repository.contract.ts";
import { createPool } from "./client.ts";
import { DrizzleLinkRepository } from "./drizzle-repository.ts";

const url = process.env.TEST_DATABASE_URL;

if (url === undefined) {
  describe.skip("LinkRepository contract: postgres (set TEST_DATABASE_URL to run)", () => {
    it("is skipped", () => {});
  });
} else {
  const pool = createPool(url);

  beforeAll(async () => {
    await migrate(drizzle(pool), { migrationsFolder: path.resolve(import.meta.dirname, "../../drizzle") });
  });
  afterAll(async () => {
    await pool.end();
  });

  describeRepositoryContract("postgres", async () => {
    await pool.query("truncate table clicks, links restart identity cascade");
    return new DrizzleLinkRepository(pool);
  });
}
