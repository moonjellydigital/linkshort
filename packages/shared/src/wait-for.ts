/**
 * Consumer-side readiness checks.
 *
 * Docker Cloud Sandboxes route `docker exec` (and therefore container
 * healthchecks and `compose exec`) to the sandbox VM's filesystem rather than
 * the target container's. Readiness therefore can't be established by Docker
 * looking *into* a container. Instead, each consumer probes its dependency over
 * the network from its own main process, which behaves identically locally and
 * in the cloud.
 *
 * Design notes:
 * - The retry loop is deterministic (no jitter): each probe has exactly one
 *   consumer, so there is no thundering herd to spread out.
 * - Time is injected through {@link Clock} so the loop is testable without
 *   real timers.
 * - The overall deadline is hard. Sleeps are clipped to it so a stuck
 *   dependency fails the run instead of silently consuming the sandbox TTL.
 * - Results are returned as values; {@link waitForOrThrow} is the thin
 *   throwing wrapper for entrypoints.
 */

/** Resolves when the dependency is ready; rejects (with any value) when it isn't. */
export type Probe = (signal: AbortSignal) => Promise<void>;

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export interface BackoffPolicy {
  /** Delay after the first failed attempt. */
  readonly initialDelayMs: number;
  /** Ceiling for any single delay. */
  readonly maxDelayMs: number;
  /** Multiplier applied per attempt; must be >= 1. */
  readonly factor: number;
}

export const DEFAULT_BACKOFF: BackoffPolicy = {
  initialDelayMs: 250,
  maxDelayMs: 5_000,
  factor: 2,
};

/**
 * Delay to wait after failed attempt number `attempt` (1-based).
 * Pure: `min(maxDelayMs, initialDelayMs * factor^(attempt-1))`.
 */
export function backoffDelay(attempt: number, policy: BackoffPolicy): number {
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new RangeError(`attempt must be a positive integer, got ${attempt}`);
  }
  if (policy.factor < 1 || policy.initialDelayMs < 0 || policy.maxDelayMs < 0) {
    throw new RangeError("invalid backoff policy");
  }
  const raw = policy.initialDelayMs * policy.factor ** (attempt - 1);
  return Math.min(policy.maxDelayMs, raw);
}

export interface WaitForOptions {
  /** Human-readable dependency name, used in messages. */
  readonly name: string;
  /** Hard deadline for the whole wait, measured from the first attempt. */
  readonly timeoutMs: number;
  /** Per-attempt timeout; a probe that doesn't settle in time counts as a failure. */
  readonly attemptTimeoutMs?: number;
  readonly backoff?: BackoffPolicy;
  readonly clock?: Clock;
  /** Observability hook, called after every failed attempt. */
  readonly onRetry?: (info: { name: string; attempt: number; error: string; delayMs: number }) => void;
}

export type WaitForResult =
  | { readonly ok: true; readonly attempts: number; readonly elapsedMs: number }
  | {
      readonly ok: false;
      readonly attempts: number;
      readonly elapsedMs: number;
      readonly lastError: string;
    };

export class AttemptTimeoutError extends Error {
  override readonly name = "AttemptTimeoutError";
}

/** Normalises any thrown value to a single-line message. */
export function describeError(error: unknown): string {
  if (error instanceof AggregateError && error.errors.length > 0) {
    return error.errors.map(describeError).join("; ");
  }
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    const message = error.message || error.name;
    return typeof code === "string" && !message.includes(code) ? `${code}: ${message}` : message;
  }
  return String(error);
}

/**
 * Runs `probe` with an abort signal, rejecting with {@link AttemptTimeoutError}
 * if it doesn't settle within `timeoutMs`. The probe is aborted on timeout;
 * probes that ignore the signal are still bounded because we stop awaiting them.
 */
async function runAttempt(probe: Probe, timeoutMs: number): Promise<void> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AttemptTimeoutError(`attempt timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    await Promise.race([probe(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Retries `probe` with exponential backoff until it succeeds or the deadline passes. */
export async function waitFor(probe: Probe, options: WaitForOptions): Promise<WaitForResult> {
  const clock = options.clock ?? systemClock;
  const backoff = options.backoff ?? DEFAULT_BACKOFF;
  const attemptTimeoutMs = options.attemptTimeoutMs ?? 5_000;
  if (options.timeoutMs <= 0) throw new RangeError("timeoutMs must be positive");

  const start = clock.now();
  const deadline = start + options.timeoutMs;
  let attempts = 0;
  let lastError = "no attempt made";

  for (;;) {
    attempts += 1;
    const remaining = deadline - clock.now();
    try {
      await runAttempt(probe, Math.max(1, Math.min(attemptTimeoutMs, remaining)));
      return { ok: true, attempts, elapsedMs: clock.now() - start };
    } catch (error) {
      lastError = describeError(error);
    }

    const left = deadline - clock.now();
    if (left <= 0) {
      return { ok: false, attempts, elapsedMs: clock.now() - start, lastError };
    }
    const delayMs = Math.min(backoffDelay(attempts, backoff), left);
    options.onRetry?.({ name: options.name, attempt: attempts, error: lastError, delayMs });
    await clock.sleep(delayMs);
  }
}

export class DependencyNotReadyError extends Error {
  override readonly name = "DependencyNotReadyError";
  constructor(
    readonly dependency: string,
    readonly result: Extract<WaitForResult, { ok: false }>,
  ) {
    super(
      `${dependency} was not ready after ${result.attempts} attempts ` +
        `(${result.elapsedMs}ms): ${result.lastError}`,
    );
  }
}

/** {@link waitFor}, but throws {@link DependencyNotReadyError} on failure. For entrypoints. */
export async function waitForOrThrow(probe: Probe, options: WaitForOptions): Promise<void> {
  const result = await waitFor(probe, options);
  if (!result.ok) throw new DependencyNotReadyError(options.name, result);
}

/**
 * Probe that succeeds when `GET url` returns a 2xx status.
 * The response body is drained so the connection can be reused or closed.
 */
export function httpProbe(url: string, init: { fetch?: typeof fetch } = {}): Probe {
  const doFetch = init.fetch ?? fetch;
  return async (signal) => {
    const response = await doFetch(url, { signal, redirect: "manual" });
    await response.body?.cancel();
    if (!response.ok) throw new Error(`GET ${url} returned ${response.status}`);
  };
}
