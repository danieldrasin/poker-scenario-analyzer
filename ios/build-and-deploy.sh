#!/bin/bash
# Build and deploy PokerAnalyzer to Dan's iPhone
# Builds locally on MacBook Pro, deploys via Mac Mini (which has iPhone paired)
# Modeled after VoiceID build script

set -e

PROJECT_DIR="/Users/DanDrasin/projects/smalltalk stuff/poker/poker-simulator/ios/PokerAnalyzer"
DEVICECTL_ID="8F8DAD63-733B-5BD1-AE14-46A20E8F4C5B"
TEAM_ID="P7QZMFBQS4"
SCHEME="PokerAnalyzer"
APP_NAME="PokerAnalyzer.app"
REMOTE_HOST="macmini"
REMOTE_TMP="/tmp/$APP_NAME"

echo "=== Building $SCHEME ==="
cd "$PROJECT_DIR"

xcodebuild build \
  -project PokerAnalyzer.xcodeproj \
  -scheme "$SCHEME" \
  -destination 'generic/platform=iOS' \
  -allowProvisioningUpdates \
  -allowProvisioningDeviceRegistration \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  2>&1 | tail -5

# Find the built .app in DerivedData
APP_PATH=$(find ~/Library/Developer/Xcode/DerivedData/${SCHEME}-*/Build/Products/Debug-iphoneos/${APP_NAME} -maxdepth 0 2>/dev/null | head -1)
if [ -z "$APP_PATH" ]; then
  echo "ERROR: Could not find built .app in DerivedData"
  exit 1
fi
echo "Built app at: $APP_PATH"

# Try local install first (if iPhone is connected to this Mac)
echo ""
echo "=== Attempting local install ==="
if xcrun devicectl device install app --device "$DEVICECTL_ID" "$APP_PATH" 2>&1; then
  echo "INSTALL_DONE (local)"
  exit 0
fi

# Fall back to Mac Mini deploy (iPhone is paired there)
echo ""
echo "=== Local install failed, deploying via Mac Mini ==="
echo "Copying .app to $REMOTE_HOST..."
ssh "$REMOTE_HOST" "rm -rf $REMOTE_TMP" 2>/dev/null
scp -r "$APP_PATH" "$REMOTE_HOST:$REMOTE_TMP"

echo "Installing on iPhone via $REMOTE_HOST..."
ssh "$REMOTE_HOST" "xcrun devicectl device install app --device $DEVICECTL_ID $REMOTE_TMP 2>&1"
INSTALL_EXIT=$?

# Clean up remote copy
ssh "$REMOTE_HOST" "rm -rf $REMOTE_TMP" 2>/dev/null

if [ $INSTALL_EXIT -eq 0 ]; then
  echo ""
  echo "INSTALL_DONE (via $REMOTE_HOST)"
else
  echo ""
  echo "INSTALL_FAILED (exit code: $INSTALL_EXIT)"
  echo "Make sure iPhone is unlocked and on the same network as the Mac Mini."
  exit 1
fi
