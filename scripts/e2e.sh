#!/usr/bin/env bash
# Runs the Playwright suite against a throwaway Compose stack.
#
# - Isolated project name: never touches a running dev stack's containers,
#   network or database volume.
# - APP_PORT=0: the host port is chosen by Docker, so dev and e2e can run at
#   the same time. Tests don't use it; they reach the app on the Compose network.
# - `compose run` (not `up --exit-code-from`): `--exit-code-from` implies
#   `--abort-on-container-exit`, which would tear the stack down the moment the
#   one-shot `migrate` service exits successfully. `run` starts dependencies,
#   honours depends_on conditions, and returns the runner's exit code.
# - On failure, all service logs are saved to e2e-results/compose.log before
#   teardown (copy them out of a cloud sandbox with `sbx --cloud cp`).
set -euo pipefail

cd "$(dirname "$0")/.."

PROJECT="${E2E_PROJECT:-linkshort-e2e}"
export APP_PORT="${APP_PORT:-0}"
RESULTS_DIR="e2e-results"

compose() { docker compose -p "$PROJECT" --profile e2e "$@"; }

cleanup() {
  local status=$?
  if [[ $status -ne 0 ]]; then
    mkdir -p "$RESULTS_DIR"
    compose logs --no-color --timestamps > "$RESULTS_DIR/compose.log" 2>&1 || true
    echo "e2e failed (exit $status); service logs: $RESULTS_DIR/compose.log" >&2
  fi
  compose down --volumes --remove-orphans --timeout 10 > /dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

rm -rf "$RESULTS_DIR" && mkdir -p "$RESULTS_DIR"

start=$(date +%s)
compose build
built=$(date +%s)
compose run --rm e2e
finished=$(date +%s)

echo "e2e passed: build $((built - start))s, test run $((finished - built))s"
