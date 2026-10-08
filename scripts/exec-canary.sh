#!/usr/bin/env bash
# Detects the Docker Cloud Sandboxes exec limitation, where `docker exec` and
# healthchecks run against the sandbox VM's filesystem instead of the target
# container's. Because the failure can be silent (exit 0, wrong file), we
# compare against a value only the container's main process could have written.
#
# Exit codes: 0 both checks behave correctly, 1 at least one is affected,
#             2 the canary itself couldn't run.
set -uo pipefail

IMAGE="${CANARY_IMAGE:-alpine:3.24.2}"
NAME="exec-canary-$$"
MARKER="canary-$(date +%s)-$RANDOM-$RANDOM"
EXEC_OK=false
HEALTH_OK=false

# shellcheck disable=SC2329  # invoked via trap
cleanup() { docker rm -f "$NAME" > /dev/null 2>&1 || true; }
trap cleanup EXIT

# The main process writes the marker to a path that exists only inside this
# container, then announces it on stdout (which `docker logs` reads via the
# runtime, not via exec). The healthcheck passes only if it can see the file.
if ! docker run -d --name "$NAME" \
  --health-cmd "grep -qx '$MARKER' /canary-marker" \
  --health-interval 1s --health-timeout 2s --health-retries 1 --health-start-period 0s \
  "$IMAGE" sh -c "echo '$MARKER' > /canary-marker && echo ready && exec sleep 120" > /dev/null; then
  echo "canary: could not start container from $IMAGE" >&2
  exit 2
fi

for _ in $(seq 1 20); do
  docker logs "$NAME" 2>/dev/null | grep -qx ready && break
  sleep 0.5
done
if ! docker logs "$NAME" 2>/dev/null | grep -qx ready; then
  echo "canary: container never reported ready" >&2
  exit 2
fi

# 1. docker exec: must read the container's file, not a (missing or stale) VM path.
got="$(docker exec "$NAME" cat /canary-marker 2>&1)"
if [[ "$got" == "$MARKER" ]]; then
  EXEC_OK=true
  echo "exec:        OK        (read the container's filesystem)"
else
  echo "exec:        AFFECTED  (expected '$MARKER', got '${got:0:120}')"
fi

# 2. Healthcheck: give it a few intervals to settle.
status="unknown"
for _ in $(seq 1 10); do
  status="$(docker inspect --format '{{.State.Health.Status}}' "$NAME" 2>/dev/null || echo unknown)"
  [[ "$status" == "healthy" || "$status" == "unhealthy" ]] && break
  sleep 1
done
if [[ "$status" == "healthy" ]]; then
  HEALTH_OK=true
  echo "healthcheck: OK        (status: healthy)"
else
  echo "healthcheck: AFFECTED  (status: $status)"
fi

$EXEC_OK && $HEALTH_OK && exit 0
echo "Keep healthchecks and exec out of the Compose workflow in this environment." >&2
exit 1
