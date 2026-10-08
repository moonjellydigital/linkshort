import { describe, expect, it } from "vitest";
import {
  backoffDelay,
  DependencyNotReadyError,
  httpProbe,
  waitFor,
  waitForOrThrow,
  type Clock,
  type Probe,
} from "./wait-for.ts";

/** Virtual clock: `sleep` advances time instantly and records each delay. */
function fakeClock(start = 1_000): Clock & { sleeps: number[]; advance(ms: number): void } {
  let t = start;
  const sleeps: number[] = [];
  return {
    sleeps,
    now: () => t,
    advance(ms) {
      t += ms;
    },
    async sleep(ms) {
      sleeps.push(ms);
      t += ms;
    },
  };
}

/** Probe that fails `n` times, then succeeds. */
function failTimes(n: number): Probe & { calls: number } {
  const probe = Object.assign(
    async () => {
      probe.calls += 1;
      if (probe.calls <= n) throw new Error(`not yet (${probe.calls})`);
    },
    { calls: 0 },
  );
  return probe;
}

const policy = { initialDelayMs: 100, maxDelayMs: 1_000, factor: 2 };

describe("backoffDelay", () => {
  it("grows geometrically and is capped", () => {
    expect([1, 2, 3, 4, 5, 6].map((a) => backoffDelay(a, policy))).toEqual([
      100, 200, 400, 800, 1_000, 1_000,
    ]);
  });

  it("supports a constant policy", () => {
    expect(backoffDelay(10, { initialDelayMs: 50, maxDelayMs: 50, factor: 1 })).toBe(50);
  });

  it.each([0, -1, 1.5, Number.NaN])("rejects attempt=%s", (attempt) => {
    expect(() => backoffDelay(attempt, policy)).toThrow(RangeError);
  });

  it("rejects a shrinking factor", () => {
    expect(() => backoffDelay(1, { ...policy, factor: 0.5 })).toThrow(RangeError);
  });
});

describe("waitFor", () => {
  it("returns immediately when the first attempt succeeds", async () => {
    const clock = fakeClock();
    const result = await waitFor(failTimes(0), { name: "db", timeoutMs: 5_000, clock });
    expect(result).toEqual({ ok: true, attempts: 1, elapsedMs: 0 });
    expect(clock.sleeps).toEqual([]);
  });

  it("retries with backoff until the probe succeeds", async () => {
    const clock = fakeClock();
    const probe = failTimes(3);
    const retries: number[] = [];
    const result = await waitFor(probe, {
      name: "db",
      timeoutMs: 10_000,
      backoff: policy,
      clock,
      onRetry: ({ attempt }) => retries.push(attempt),
    });
    expect(result).toEqual({ ok: true, attempts: 4, elapsedMs: 700 });
    expect(clock.sleeps).toEqual([100, 200, 400]);
    expect(retries).toEqual([1, 2, 3]);
  });

  it("never sleeps past the deadline and reports the last error", async () => {
    const clock = fakeClock();
    const result = await waitFor(failTimes(Infinity), {
      name: "db",
      timeoutMs: 650,
      backoff: policy,
      clock,
    });
    // 100 + 200 = 300 elapsed, then the 400ms delay is clipped to the remaining 350.
    expect(clock.sleeps).toEqual([100, 200, 350]);
    expect(result).toEqual({ ok: false, attempts: 4, elapsedMs: 650, lastError: "not yet (4)" });
  });

  it("treats a probe that ignores its abort signal as a timed-out attempt", async () => {
    const hang: Probe = () => new Promise(() => {});
    const result = await waitFor(hang, {
      name: "hang",
      timeoutMs: 60,
      attemptTimeoutMs: 20,
      backoff: { initialDelayMs: 1, maxDelayMs: 1, factor: 1 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.lastError).toMatch(/timed out after \d+ms/);
  });

  it("aborts the probe's signal when an attempt times out", async () => {
    let aborted = false;
    const probe: Probe = (signal) =>
      new Promise((_, reject) => {
        signal.addEventListener("abort", () => {
          aborted = true;
          reject(new Error("aborted"));
        });
      });
    await waitFor(probe, {
      name: "x",
      timeoutMs: 30,
      attemptTimeoutMs: 10,
      backoff: { initialDelayMs: 50, maxDelayMs: 50, factor: 1 },
    });
    expect(aborted).toBe(true);
  });

  it("rejects a non-positive timeout", async () => {
    await expect(waitFor(failTimes(0), { name: "x", timeoutMs: 0 })).rejects.toThrow(RangeError);
  });
});

describe("waitForOrThrow", () => {
  it("throws a descriptive error naming the dependency", async () => {
    const clock = fakeClock();
    const failure = waitForOrThrow(failTimes(Infinity), {
      name: "postgres",
      timeoutMs: 100,
      backoff: policy,
      clock,
    });
    await expect(failure).rejects.toBeInstanceOf(DependencyNotReadyError);
    await expect(failure).rejects.toThrow(/^postgres was not ready after 2 attempts \(100ms\)/);
  });
});

describe("httpProbe", () => {
  const respond = (status: number): typeof fetch =>
    (async () => new Response("body", { status })) as typeof fetch;

  it("resolves on 2xx", async () => {
    await expect(httpProbe("http://x/readyz", { fetch: respond(200) })(new AbortController().signal))
      .resolves.toBeUndefined();
  });

  it("rejects on non-2xx with the status in the message", async () => {
    await expect(httpProbe("http://x/readyz", { fetch: respond(503) })(new AbortController().signal))
      .rejects.toThrow("GET http://x/readyz returned 503");
  });
});
