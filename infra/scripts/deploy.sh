#!/usr/bin/env bash
# Zero-downtime deploy of a tag/commit on the server (blue/green web):
#   1. build the web + worker images for the release (the live site keeps serving)
#   2. start web on the idle colour (3100 blue / 3101 green) and wait until it is healthy
#   3. point nginx at it (graceful reload), then stop the old colour
#   4. recreate the worker on the new image (no user-facing traffic)
# If the new web never gets healthy, nginx is not touched and the old colour stays live.
#   bash infra/scripts/deploy.sh v2026.10.12-1
set -euo pipefail

REF="${1:?usage: deploy.sh <tag-or-commit>}"
ROOT="${ZAVIYA_ROOT:-/var/www/aurm-test}"
APP="$ROOT/app"
STATE="$ROOT/releases"
ENVF="$ROOT/env/compose.env"
mkdir -p "$STATE"

git -C "$APP" fetch --quiet --tags --force origin
git -C "$APP" checkout --quiet --force --detach "$REF"
SHA=$(git -C "$APP" rev-parse --short HEAD)
RELEASE=$(echo "$REF" | tr -c 'A-Za-z0-9_.\n-' '-')
PREVIOUS=$(cat "$STATE/current" 2>/dev/null || true)

stack() { (cd "$APP/infra" && RELEASE="$1" docker compose -p zaviya -f docker-compose.server.yml --env-file "$ENVF" "${@:2}"); }
web() { # web <colour> <release> <compose args...>
  local port=3100; [ "$1" = green ] && port=3101
  (cd "$APP/infra" && RELEASE="$2" WEB_PORT=$port docker compose -p "zaviya-web-$1" -f docker-compose.web.yml --env-file "$ENVF" "${@:3}")
}

live_colour() {
  if grep -q '127.0.0.1:3101' /etc/nginx/conf.d/zaviya-upstream.conf 2>/dev/null; then echo green; else echo blue; fi
}

web_healthy() { # web_healthy <port>
  for _ in $(seq 1 50); do
    curl -fsS -o /dev/null --max-time 5 "http://127.0.0.1:$1/robots.txt" \
      && curl -fsS -o /dev/null --max-time 10 "http://127.0.0.1:$1/" && return 0
    sleep 6
  done
  return 1
}

LIVE=$(live_colour)
NEXT=blue; NEXT_PORT=3100
[ "$LIVE" = blue ] && { NEXT=green; NEXT_PORT=3101; }

echo "==> $RELEASE ($SHA): live=$LIVE, deploying to $NEXT"
web "$NEXT" "$RELEASE" build
stack "$RELEASE" build worker

web "$NEXT" "$RELEASE" up -d --force-recreate
if ! web_healthy "$NEXT_PORT"; then
  echo "!! $RELEASE web on $NEXT is not healthy; $LIVE stays live"
  web "$NEXT" "$RELEASE" logs --tail 80 || true
  web "$NEXT" "$RELEASE" down || true
  echo "$(date -u +%FT%TZ) $RELEASE $SHA failed (web)" >> "$STATE/history.log"
  exit 1
fi

sudo /usr/local/bin/zaviya-switch-upstream "$NEXT_PORT"
sleep 5 # let in-flight requests on the old colour finish
web "$LIVE" "${PREVIOUS:-latest}" down --remove-orphans 2>/dev/null || true
# One-time cleanup: the web service used to live in the main stack
docker rm -f zaviya-web-1 >/dev/null 2>&1 || true

stack "$RELEASE" up -d --remove-orphans postgres redis worker
for _ in $(seq 1 20); do
  [ "$(docker inspect -f '{{.State.Running}}' zaviya-worker-1 2>/dev/null)" = true ] && break
  sleep 3
done

echo "$RELEASE" > "$STATE/current"
echo "$NEXT" > "$STATE/colour"
echo "$(date -u +%FT%TZ) $RELEASE $SHA ok ($NEXT)" >> "$STATE/history.log"
docker image prune -f >/dev/null
echo "==> $RELEASE is live on $NEXT"
