#!/usr/bin/env bash
# Deploy a tag/commit on the server: build images tagged with the release, switch over,
# health-check, and roll back to the previous release if the new one is unhealthy.
#   bash infra/scripts/deploy.sh v2026.10.11-1
set -euo pipefail

REF="${1:?usage: deploy.sh <tag-or-commit>}"
ROOT="${ZAVIYA_ROOT:-/var/www/aurm-test}"
APP="$ROOT/app"
STATE="$ROOT/releases"
mkdir -p "$STATE"

git -C "$APP" fetch --quiet --tags --force origin
git -C "$APP" checkout --quiet --force --detach "$REF"
SHA=$(git -C "$APP" rev-parse --short HEAD)
RELEASE=$(echo "$REF" | tr -c 'A-Za-z0-9_.-\n' '-')
PREVIOUS=$(cat "$STATE/current" 2>/dev/null || true)

dc() { (cd "$APP/infra" && RELEASE="$1" docker compose -f docker-compose.server.yml --env-file "$ROOT/env/compose.env" "${@:2}"); }

healthy() {
  for _ in $(seq 1 40); do
    if curl -fsS -o /dev/null --max-time 5 http://127.0.0.1:3100/robots.txt \
      && [ "$(docker inspect -f '{{.State.Running}}' zaviya-worker-1 2>/dev/null)" = true ]; then
      return 0
    fi
    sleep 6
  done
  return 1
}

echo "==> building $RELEASE ($SHA)"
dc "$RELEASE" build web worker
dc "$RELEASE" up -d --remove-orphans

if healthy; then
  echo "$RELEASE" > "$STATE/current"
  echo "$(date -u +%FT%TZ) $RELEASE $SHA ok" >> "$STATE/history.log"
  docker image prune -f >/dev/null
  echo "==> $RELEASE is live"
  exit 0
fi

echo "!! $RELEASE failed health check"
echo "$(date -u +%FT%TZ) $RELEASE $SHA failed" >> "$STATE/history.log"
dc "$RELEASE" logs --tail 80 web worker || true
if [ -n "$PREVIOUS" ]; then
  echo "==> rolling back to $PREVIOUS"
  dc "$PREVIOUS" up -d --no-build
  healthy && echo "==> rolled back to $PREVIOUS"
fi
exit 1
