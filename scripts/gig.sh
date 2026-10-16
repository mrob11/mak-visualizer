#!/bin/sh
# Run MAK Visualizer under launchd so it relaunches automatically if it crashes.
#
#   scripts/gig.sh start [path/to/MAK Visualizer.app]   launch it, supervised
#   scripts/gig.sh stop                                 quit it and stop supervising
#   scripts/gig.sh status                               show launchd's view of the job
#
# A normal quit (Cmd+Q, exit status 0) is respected and won't relaunch; a crash or
# non-zero exit relaunches within a few seconds. The job file is kept outside
# ~/Library/LaunchAgents on purpose, so it doesn't start the app at every login.

set -eu

LABEL="com.menamongstkings.visualizer.supervisor"
DOMAIN="gui/$(id -u)"
PLIST_DIR="$HOME/Library/Application Support/com.menamongstkings.visualizer"
PLIST="$PLIST_DIR/$LABEL.plist"
LOG="$HOME/Library/Logs/mak-visualizer.log"

stop() {
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
}

start() {
  app="${1:-/Applications/MAK Visualizer.app}"
  if [ ! -d "$app" ]; then
    echo "App not found at: $app" >&2
    echo "Build it with 'pnpm tauri build', or pass the .app path as an argument." >&2
    exit 1
  fi
  exe_name=$(/usr/libexec/PlistBuddy -c "Print :CFBundleExecutable" "$app/Contents/Info.plist")
  exe="$app/Contents/MacOS/$exe_name"

  mkdir -p "$PLIST_DIR" "$(dirname "$LOG")"
  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$exe</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>3</integer>
  <key>ProcessType</key>
  <string>Interactive</string>
  <key>StandardOutPath</key>
  <string>$LOG</string>
  <key>StandardErrorPath</key>
  <string>$LOG</string>
</dict>
</plist>
EOF

  stop
  launchctl bootstrap "$DOMAIN" "$PLIST"
  echo "Started under launchd. Logs: $LOG"
}

case "${1:-}" in
  start) shift; start "$@" ;;
  stop) stop; echo "Stopped." ;;
  status) launchctl print "$DOMAIN/$LABEL" ;;
  *) echo "usage: $0 start [app path] | stop | status" >&2; exit 2 ;;
esac
