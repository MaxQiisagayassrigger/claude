#!/bin/bash
# AI Megacap Forecast installer for macOS.
# Double-click it in Finder, or run:  bash Install.command
#
# Installs:
#   ~/Library/Application Support/AI Megacap Forecast/   the site and the data pipeline
#   /Applications/AI Megacap Forecast.app                opens the site
#     (or ~/Applications when /Applications isn't writable)

APP_NAME="AI Megacap Forecast"
HERE="$(cd "$(dirname "$0")" && pwd)"

# Works from the download package (payload/ next to this file) or from a
# checkout of the repository (this file in mac/).
if [ -f "$HERE/payload/ai-forecast/index.html" ]; then
  SRC="$HERE/payload"
elif [ -f "$HERE/../ai-forecast/index.html" ]; then
  SRC="$(cd "$HERE/.." && pwd)"
else
  echo "Can't find the site files. Keep Install.command in the folder it came in and try again."
  exit 1
fi

DATA_DIR="$HOME/Library/Application Support/$APP_NAME"
if [ -d /Applications ] && [ -w /Applications ]; then APPS_DIR="/Applications"; else APPS_DIR="$HOME/Applications"; fi
BUNDLE="$APPS_DIR/$APP_NAME.app"
GEN="ai-forecast/data/generated/forecast.js"

echo "Installing $APP_NAME"
echo

# 1. Copy the site and pipeline, keeping prices downloaded by an earlier install.
KEEP=""
if [ -f "$DATA_DIR/$GEN" ] && ! grep -q "AI_GENERATED = null" "$DATA_DIR/$GEN"; then
  KEEP="$(mktemp)"
  cp "$DATA_DIR/$GEN" "$KEEP"
fi
mkdir -p "$DATA_DIR" || { echo "Couldn't create $DATA_DIR"; exit 1; }
for item in ai-forecast pipeline mac assets data index.html README.md; do
  if [ -e "$SRC/$item" ]; then
    rm -rf "${DATA_DIR:?}/$item"
    cp -R "$SRC/$item" "$DATA_DIR/$item" || { echo "Couldn't copy $item"; exit 1; }
  fi
done
find "$DATA_DIR" -name "__pycache__" -type d -prune -exec rm -rf {} + 2>/dev/null
if [ -n "$KEEP" ]; then
  cp "$KEEP" "$DATA_DIR/$GEN"
  rm -f "$KEEP"
fi
chmod +x "$DATA_DIR/mac/"*.sh "$DATA_DIR/mac/"*.command 2>/dev/null
# Files unpacked from a download are quarantined; these are now installed.
command -v xattr >/dev/null 2>&1 && xattr -dr com.apple.quarantine "$DATA_DIR" 2>/dev/null
echo "✓ Site files:  $DATA_DIR"

# 2. Build the app. It is created on this Mac, so Gatekeeper doesn't block it.
mkdir -p "$APPS_DIR"
rm -rf "$BUNDLE"
mkdir -p "$BUNDLE/Contents/MacOS" "$BUNDLE/Contents/Resources"
cp "$DATA_DIR/mac/launcher.sh" "$BUNDLE/Contents/MacOS/launcher"
chmod +x "$BUNDLE/Contents/MacOS/launcher"
[ -f "$DATA_DIR/mac/AppIcon.icns" ] && cp "$DATA_DIR/mac/AppIcon.icns" "$BUNDLE/Contents/Resources/AppIcon.icns"
cat > "$BUNDLE/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>AI Megacap Forecast</string>
  <key>CFBundleDisplayName</key>
  <string>AI Megacap Forecast</string>
  <key>CFBundleIdentifier</key>
  <string>local.ai-megacap-forecast</string>
  <key>CFBundleExecutable</key>
  <string>launcher</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>10.13</string>
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>
PLIST
touch "$BUNDLE"
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
[ -x "$LSREGISTER" ] && "$LSREGISTER" -f "$BUNDLE" >/dev/null 2>&1
echo "✓ App:         $BUNDLE"
echo

# 3. Optionally download prices now (needs Python 3).
if "$DATA_DIR/mac/refresh.sh" --check; then
  printf "Download ten years of prices now so the forecasts use measured data? It takes about a minute. [Y/n] "
  read -r answer
  case "$answer" in
    n|N|no|No|NO) echo "Skipped. The app updates prices by itself when you open it." ;;
    *) "$DATA_DIR/mac/refresh.sh" ;;
  esac
else
  echo "Python 3 isn't installed, so the site will use its built-in research data."
  echo "To add measured prices later, install Python (run: xcode-select --install) and open the app again."
fi

echo
echo "Done. Opening $APP_NAME…"
open "$BUNDLE" 2>/dev/null
open -R "$BUNDLE" 2>/dev/null
echo
echo "Open it again any time from Launchpad or Spotlight, or drag it from the Finder window to your Dock."
echo "Opening the app refreshes prices whenever they are more than 12 hours old."
echo "To remove it, double-click Uninstall.command."
echo
echo "You can close this window."
