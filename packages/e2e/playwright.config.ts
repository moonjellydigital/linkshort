/**
 * Runs inside the `e2e` container against the Compose network (BASE_URL,
 * default http://app:3000). Nothing here reaches the public internet:
 * redirects are asserted without being followed, and browsers ship in the
 * Playwright base image.
 *
 * Results go to ./results, which Compose bind-mounts to ./e2e-results on the
 * host (copy them out of a cloud sandbox with `sbx --cloud cp`).
 */
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests",
  outputDir: "./results/artifacts",
  globalSetup: "./global-setup.ts",
  fullyParallel: true,
  forbidOnly: process.env.CI !== undefined,
  // Retries hide flakiness, and flakiness is part of what this suite measures.
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [
    ["list"],
    ["junit", { outputFile: "./results/junit.xml" }],
    ["html", { outputFolder: "./results/html", open: "never" }],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
