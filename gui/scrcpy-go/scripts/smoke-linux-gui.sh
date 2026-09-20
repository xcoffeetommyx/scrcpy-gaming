#!/usr/bin/env bash
set -euo pipefail
executable=$1
name=$2
output=${SCRCPY_GO_SCREENSHOT_DIR:?}
export GDK_BACKEND=x11
unset WAYLAND_DISPLAY
dbus-run-session -- "$executable" > "$output/$name.log" 2>&1 &
pid=$!
trap 'kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true' EXIT
sleep 10
if ! kill -0 "$pid" 2>/dev/null; then
    cat "$output/$name.log"
    echo "$name exited before showing a stable window" >&2
    exit 1
fi
xwininfo -root -tree | tee "$output/$name-windows.txt"
grep -q 'Scrcpy GO' "$output/$name-windows.txt"
import -window root "$output/$name.png"
cat "$output/$name.log"
