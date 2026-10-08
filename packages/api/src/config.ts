/**
 * Process configuration, parsed once from the environment at startup.
 * Invalid configuration is a startup failure with a message naming each bad
 * variable, never a latent runtime error.
 */
import path from "node:path";
import { z } from "zod";

const LogLevelSchema = z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]);

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: LogLevelSchema.default("info"),
  /** Directory containing the built web client. Unset: the API serves no UI. */
  STATIC_DIR: z.string().min(1).optional(),
  /** Directory of committed Drizzle migrations. */
  MIGRATIONS_DIR: z.string().min(1).default("drizzle"),
  /** How long entrypoints wait for Postgres before giving up. */
  DB_READY_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
});

export interface Config {
  readonly databaseUrl: string;
  readonly host: string;
  readonly port: number;
  readonly logLevel: z.infer<typeof LogLevelSchema>;
  readonly staticDir: string | undefined;
  readonly migrationsDir: string;
  readonly dbReadyTimeoutMs: number;
}

export class ConfigError extends Error {
  override readonly name = "ConfigError";
}

/** Pure: maps an environment record to {@link Config} or throws {@link ConfigError}. */
export function parseConfig(env: Readonly<Record<string, string | undefined>>): Config {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues
      .map((i) => `${i.path.join(".") || "(env)"}: ${i.message}`)
      .join("; ");
    throw new ConfigError(`Invalid configuration: ${problems}`);
  }
  const e = result.data;
  return {
    databaseUrl: e.DATABASE_URL,
    host: e.HOST,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    staticDir: e.STATIC_DIR === undefined ? undefined : path.resolve(e.STATIC_DIR),
    migrationsDir: path.resolve(e.MIGRATIONS_DIR),
    dbReadyTimeoutMs: e.DB_READY_TIMEOUT_MS,
  };
}
