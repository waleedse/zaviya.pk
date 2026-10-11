#!/usr/bin/env bash
# Starts Colima (and with it every Zaviya container, which use restart: unless-stopped)
# whenever you log in, and keeps the Mac awake while it runs.
# Usage: bash infra/mac/install-docker-autostart.sh
set -euo pipefail

LABEL="pk.zaviya.colima"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/zaviya-colima.log"
COLIMA="$(command -v colima || echo "$HOME/.local/bin/colima")"
[ -x "$COLIMA" ] || { echo "colima not found"; exit 1; }

# The old native worker service would fight the Docker worker for the same port and queues.
launchctl bootout "gui/$(id -u)/pk.zaviya.worker" 2>/dev/null && echo "Removed the old native worker service" || true

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat >"$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/caffeinate</string>
    <string>-ims</string>
    <string>$COLIMA</string>
    <string>start</string>
    <string>--foreground</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$HOME/.local/bin:$HOME/.local/lima/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Colima will start at login. Logs: $LOG"
echo "Remove: launchctl bootout gui/$(id -u)/$LABEL && rm $PLIST"
