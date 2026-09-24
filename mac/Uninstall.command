#!/bin/bash
# Removes AI Megacap Forecast: the app, its site files, downloaded prices and log.

APP_NAME="AI Megacap Forecast"
TARGETS=(
  "/Applications/$APP_NAME.app"
  "$HOME/Applications/$APP_NAME.app"
  "$HOME/Library/Application Support/$APP_NAME"
  "$HOME/Library/Logs/$APP_NAME.log"
)

found=0
for t in "${TARGETS[@]}"; do
  [ -e "$t" ] && { echo "  $t"; found=1; }
done
if [ "$found" -eq 0 ]; then
  echo "$APP_NAME isn't installed."
  exit 0
fi

printf "Remove the items above? [y/N] "
read -r answer
case "$answer" in
  y|Y|yes|Yes|YES) ;;
  *) echo "Nothing was removed."; exit 0 ;;
esac

for t in "${TARGETS[@]}"; do
  rm -rf "$t"
done
echo "$APP_NAME has been removed. You can close this window."
