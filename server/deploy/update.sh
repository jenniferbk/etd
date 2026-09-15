#!/bin/bash
# Self-update: pull origin/main; on change, rebuild + restart; roll back on failed health check.
# Assumes the repo lives at $HOME/etd and the server runs via com.etd.server.agent (LaunchAgent).
PORT=8787   # keep in sync with com.etd.server.agent.plist
cd "$HOME/etd" || exit 1
git fetch origin main --quiet || exit 0   # network blip: try again next interval
LOCAL=$(git rev-parse HEAD); REMOTE=$(git rev-parse origin/main)
[ "$LOCAL" = "$REMOTE" ] && exit 0

build_and_restart() {
  npm install --no-audit --no-fund --silent && npm run build --silent &&
  (cd server && npm install --no-audit --no-fund --silent) &&
  launchctl kickstart -k "gui/$(id -u)/com.etd.server.agent" && sleep 5 &&
  curl -sf -m 5 "localhost:$PORT/api/health" >/dev/null
}

echo "$(date): updating $LOCAL -> $REMOTE"
if git pull --ff-only --quiet && build_and_restart; then
  echo "$(date): update ok ($(git rev-parse --short HEAD))"
else
  echo "$(date): update FAILED — rolling back to $LOCAL"
  git reset --hard "$LOCAL"
  build_and_restart && echo "$(date): rollback ok" || echo "$(date): ROLLBACK FAILED — needs hands"
fi
