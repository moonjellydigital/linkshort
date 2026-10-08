import { defineConfig } from "drizzle-kit";

/**
 * Migrations are generated at development time (`pnpm db:generate`) and
 * committed. The runtime migrator only applies them; it never diffs schemas.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  strict: true,
});
