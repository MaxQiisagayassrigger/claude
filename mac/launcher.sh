#!/bin/bash
# The executable inside "AI Megacap Forecast.app". Opens the site in the
# default browser, then refreshes prices in the background if they are stale.

APP_NAME="AI Megacap Forecast"
ROOT="$HOME/Library/Application Support/$APP_NAME"
SITE="$ROOT/ai-forecast/index.html"

if [ ! -f "$SITE" ]; then
  osascript -e "display alert \"$APP_NAME\" message \"The site files are missing. Run Install.command again.\"" >/dev/null 2>&1
  exit 1
fi

open "$SITE"

if "$ROOT/mac/refresh.sh" --check; then
  nohup "$ROOT/mac/refresh.sh" --if-stale >/dev/null 2>&1 &
fi
exit 0
