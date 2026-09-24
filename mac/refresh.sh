#!/bin/bash
# Download prices and rebuild the measured inputs for AI Megacap Forecast.
#
#   refresh.sh             update now and show progress
#   refresh.sh --if-stale  update in the background only if the data is more
#                          than 12 hours old (the app runs this when it opens)
#   refresh.sh --check     exit 0 if a usable Python 3 is installed
#
# Set PYTHON=/path/to/python3 to choose the interpreter.

APP_NAME="AI Megacap Forecast"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/ai-forecast/data/generated/forecast.js"
LOG_DIR="$HOME/Library/Logs"
LOG="$LOG_DIR/$APP_NAME.log"
MODE="${1:-}"

py_ok() {
  "$1" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)' >/dev/null 2>&1
}

# Apps start with a minimal PATH, so look in the usual install locations too.
find_python() {
  local c
  for c in "${PYTHON:-}" /opt/homebrew/bin/python3 /usr/local/bin/python3 \
           /Library/Frameworks/Python.framework/Versions/Current/bin/python3 \
           "$(command -v python3 2>/dev/null)"; do
    [ -n "$c" ] && [ -x "$c" ] || continue
    # /usr/bin/python3 is only a stub that asks to install the Command Line
    # Tools until they are installed; don't trigger that dialog from the app.
    if [ "$c" = /usr/bin/python3 ] && command -v xcode-select >/dev/null 2>&1 && ! xcode-select -p >/dev/null 2>&1; then
      continue
    fi
    if py_ok "$c"; then echo "$c"; return 0; fi
  done
  return 1
}

notify() {
  command -v osascript >/dev/null 2>&1 &&
    osascript -e "display notification \"$1\" with title \"$APP_NAME\"" >/dev/null 2>&1
}

# Measured data exists and is less than 12 hours old.
is_fresh() {
  [ -f "$OUT" ] && ! grep -q "AI_GENERATED = null" "$OUT" && [ -n "$(find "$OUT" -mmin -720 2>/dev/null)" ]
}

PY="$(find_python)"
if [ "$MODE" = "--check" ]; then
  [ -n "$PY" ]
  exit $?
fi
if [ -z "$PY" ]; then
  echo "Python 3.8 or later is needed to download prices."
  echo "Install it with:  xcode-select --install   (or from https://www.python.org/downloads/macos/)"
  exit 2
fi
if [ "$MODE" = "--if-stale" ] && is_fresh; then
  exit 0
fi

# One update at a time; clear a lock left behind by a crash after 30 minutes.
LOCK="$ROOT/.refresh.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +30 2>/dev/null)" ]; then
    rmdir "$LOCK" 2>/dev/null
    mkdir "$LOCK" 2>/dev/null || exit 0
  else
    [ "$MODE" = "--if-stale" ] || echo "A price update is already running."
    exit 0
  fi
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

# Python from python.org ships without CA certificates; use the system bundle.
if [ -z "${SSL_CERT_FILE:-}" ] && [ -f /etc/ssl/cert.pem ]; then
  export SSL_CERT_FILE=/etc/ssl/cert.pem
fi

mkdir -p "$LOG_DIR"
echo "=== $(date) · $PY ===" >> "$LOG"
cd "$ROOT" || exit 1
if [ "$MODE" = "--if-stale" ]; then
  notify "Updating prices in the background. Reload the page in a minute or two."
  "$PY" -m pipeline.ai_forecast >> "$LOG" 2>&1
  status=$?
else
  echo "Downloading about ten years of daily prices for 50 stocks and the S&P 500…"
  "$PY" -m pipeline.ai_forecast 2>&1 | tee -a "$LOG"
  status=${PIPESTATUS[0]}
fi

if [ "$status" -eq 0 ]; then
  notify "Prices updated. Reload the page to see the new forecasts."
else
  notify "Price update failed. Details are in Library/Logs/$APP_NAME.log"
  [ "$MODE" = "--if-stale" ] || echo "Price update failed. The site still works with its built-in research data. Log: $LOG"
fi
exit "$status"
