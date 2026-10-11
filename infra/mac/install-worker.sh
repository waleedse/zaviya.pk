#!/usr/bin/env bash
# Runs the Zaviya worker 24/7 on this Mac: starts at login, restarts if it crashes,
# and keeps the Mac awake while it runs. Usage: bash infra/mac/install-worker.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
WORKER="$REPO/apps/worker"
LABEL="pk.zaviya.worker"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/zaviya-worker.log"
NODE_BIN="$(command -v node)"
TSX="$REPO/node_modules/.bin/tsx"
[ -x "$TSX" ] || TSX="$WORKER/node_modules/.bin/tsx"

[ -f "$WORKER/.env" ] || { echo "Missing $WORKER/.env (copy .env.example and fill it in)"; exit 1; }
[ -n "$NODE_BIN" ] || { echo "node not found on PATH"; exit 1; }

# Redis and Ollama must also come up after a reboot.
if command -v brew >/dev/null; then
  brew services start redis >/dev/null 2>&1 || true
fi
if ! curl -s http://127.0.0.1:11434/api/version >/dev/null; then
  echo "Note: start the Ollama app once and enable 'Launch at login' in its menu."
fi

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat >"$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>WorkingDirectory</key><string>$WORKER</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/caffeinate</string>
    <string>-ims</string>
    <string>$NODE_BIN</string>
    <string>$TSX</string>
    <string>--env-file=.env</string>
    <string>src/index.ts</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$(dirname "$NODE_BIN"):/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    <key>NODE_ENV</key><string>production</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>15</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/$LABEL"
echo "Worker installed and running. Logs: $LOG"
echo "Stop:    launchctl bootout gui/$(id -u)/$LABEL"
echo "Restart: launchctl kickstart -k gui/$(id -u)/$LABEL"
