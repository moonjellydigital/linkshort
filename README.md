# linkshort

A deliberately small full-stack TypeScript app (link shortener with click
counts) whose real purpose is to answer one question:

> Does a Compose-based e2e suite run reliably inside a Docker Cloud Sandbox?

Cloud sandboxes have a documented limitation: `docker exec`,
`docker compose exec` and container **healthchecks** can run against the
sandbox VM's filesystem instead of the target container's, sometimes failing
and sometimes *succeeding against the wrong files*. This project is designed
so none of those code paths are used, and ships a canary that detects the
limitation directly.

## Design rules

1. **No healthchecks, no `service_healthy`, no `exec`.** The same
   `compose.yaml` runs on a laptop and in the sandbox.
2. **Readiness lives in the consumers.** Each process probes its dependency
   over the network from its own main process, using one shared, unit-tested
   module (`packages/shared/src/wait-for.ts`): bounded exponential backoff,
   per-attempt timeouts, and a hard deadline so a stuck dependency fails the
   run instead of consuming the sandbox TTL.
   - `migrate` and `app` wait for Postgres with a real `select 1`, not a port check.
   - Playwright's `globalSetup` waits for `GET /readyz`.
3. **Ordering via exit codes.** `app` depends on `migrate` with
   `service_completed_successfully`, which keys off a main-process exit status.
4. **Fully offline at test time.** No web fonts, no CDNs. Redirects are
   asserted without being followed, and browsers ship in the Playwright image.
   A test fails if the page makes any request off its own origin.

## Layout

```
compose.yaml            single file: dev + e2e (profile), no healthchecks
Dockerfile              targets: runtime (app + migrate), e2e (Playwright)
scripts/e2e.sh          isolated, self-cleaning e2e run
scripts/exec-canary.sh  detects the exec/healthcheck limitation
packages/
  shared/   Zod wire contracts + waitFor readiness module
  api/      Fastify + Drizzle; bundled by esbuild (no node_modules at runtime)
  web/      React + Vite dashboard (served by the API in containers)
  e2e/      Playwright suite incl. axe-core WCAG 2.2 AA scans
```

Services: `db` (Postgres 18) → `migrate` (one-shot) → `app` (API + UI) → `e2e`.

## Running it

Requires Docker with Compose v2. For local development without containers,
you'll also need Node ≥ 22.12 and pnpm 12.

```sh
# Dev stack at http://localhost:3000
docker compose up --build

# e2e: isolated project name, random host port, tears down volumes afterwards
./scripts/e2e.sh

# Does `docker exec` / healthchecking work correctly in this environment?
./scripts/exec-canary.sh     # exit 0 = OK, 1 = affected, 2 = couldn't run
```

The dev and e2e stacks can run at the same time. The e2e run uses its own
project name and `APP_PORT=0` (Docker picks the host port).

Without Docker:

```sh
pnpm install
pnpm test                                   # unit + contract tests
TEST_DATABASE_URL=postgres://… pnpm test    # also runs the repository contract against real Postgres
pnpm --filter @linkshort/api dev            # API on :3000 (needs DATABASE_URL)
pnpm --filter @linkshort/web dev            # Vite with /api proxied to :3000
```

### Configuration

| Variable | Used by | Default |
| --- | --- | --- |
| `APP_HOST_IP` | compose | `127.0.0.1` (set `0.0.0.0` if a port forwarder needs it) |
| `APP_PORT` | compose | `3000` (`0` = any free port) |
| `LOG_LEVEL` | app | `info` |
| `DB_READY_TIMEOUT_MS` | app, migrate | `60000` |
| `APP_READY_TIMEOUT_MS` | e2e | `120000` |

## Evaluating it in a Docker Cloud Sandbox

The sequence below follows the `sbx` usage documentation. Flag spellings,
especially how to allow multiple network destinations, may change while the
feature is experimental, so check `sbx --cloud create --help`.

```sh
# 4 vCPU / 8 GiB gives Chromium headroom; 2h TTL covers cold builds.
sbx --cloud create --name linkshort-eval --cpus 4 --memory 8g --ttl 2h \
  --allow-network github.com:443 \
  --allow-network registry-1.docker.io:443 --allow-network auth.docker.io:443 \
  --allow-network production.cloudflare.docker.com:443 \
  --allow-network mcr.microsoft.com:443 \
  --allow-network registry.npmjs.org:443 \
  shell

sbx --cloud exec linkshort-eval git clone <your-repo-url> /home/agent/workspace/linkshort
sbx --cloud exec linkshort-eval bash -lc 'cd /home/agent/workspace/linkshort && ./scripts/exec-canary.sh; ./scripts/e2e.sh'
sbx --cloud cp linkshort-eval:/home/agent/workspace/linkshort/e2e-results ./e2e-results-cloud
sbx --cloud rm --force linkshort-eval
```

The registry hostnames above are my best understanding of what Docker Hub,
MCR (which may also redirect blob downloads to a `*.data.mcr.microsoft.com`
host) and npm need. If a build fails with a network error, the proxy's deny
reason will name the missing host.

### What to record

- **Canary result.** `exec-canary.sh` output tells you whether the limitation
  is active. Re-run it periodically: when it passes, healthchecks could be
  reintroduced.
- **Timings.** `e2e.sh` prints build and test-run durations. Compare a cold
  sandbox, a warm sandbox and your laptop.
- **Flakiness.** Retries are disabled on purpose. For a stability signal, run
  the suite repeatedly:
  `docker compose -p linkshort-e2e --profile e2e run --rm e2e pnpm exec playwright test --repeat-each=5`
- **Artifacts.** `e2e-results/` holds JUnit XML, the HTML report, traces for
  failures, and `compose.log` (all service logs) when a run fails.

## Verification status

Verified in a Linux environment without Docker:

- 110 unit and contract tests pass. This includes the repository contract
  against a real Postgres whose session time zone was deliberately set to
  `America/Los_Angeles`, to prove daily bucketing is UTC.
- The bundled API and migrator run correctly. Re-running migrations is a
  no-op, and SIGTERM shuts down cleanly.
- The full Playwright suite (18 tests) passes against the bundled app at
  `http://app:…`, a non-secure context as in Compose. It also passed 54 of 54
  with 4 workers and 3 repeats. The real-clipboard branch passes on `localhost`.
- `compose.yaml` validates with Docker Compose v5.6.0.

**Not yet verified:** the images building, and the stack running under
Docker, locally or in the sandbox. The local e2e run used Playwright 1.63
with an older preinstalled Chromium, while the container uses the matching
browser from the `v1.63.0-noble` image.
