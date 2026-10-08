/**
 * Waits for the app to report ready before any test runs. This replaces a
 * Compose healthcheck: the probe runs in this container's main process and
 * reaches the app over the network, so it behaves the same locally and in a
 * Docker Cloud Sandbox (where healthchecks run against the wrong filesystem).
 */
import { httpProbe, waitForOrThrow } from "@linkshort/shared/wait-for";
import type { FullConfig } from "@playwright/test";

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  if (baseURL === undefined) throw new Error("baseURL is not configured");
  const timeoutMs = Number(process.env.APP_READY_TIMEOUT_MS ?? 120_000);

  const started = Date.now();
  await waitForOrThrow(httpProbe(new URL("/readyz", baseURL).toString()), {
    name: `app (${baseURL})`,
    timeoutMs,
    onRetry: ({ attempt, error, delayMs }) =>
      console.log(`waiting for app: attempt ${attempt} failed (${error}); retrying in ${delayMs}ms`),
  });
  console.log(`app ready after ${Date.now() - started}ms`);
}
