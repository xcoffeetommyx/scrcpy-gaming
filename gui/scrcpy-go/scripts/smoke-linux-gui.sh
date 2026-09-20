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
if [[ -n "${SCRCPY_GO_CONNECT_MARKER:-}" ]]; then
    touch "$SCRCPY_GO_CONNECT_MARKER"
    sleep 4
    kill -0 "$pid"
    import -window root "$output/$name-connected.png"
fi
# The settings window must contain painted content, not just an X window.
contrast=$(convert "$output/$name.png" -crop 600x400+250+200 +repage -format '%[fx:standard_deviation]' info:)
awk -v value="$contrast" 'BEGIN { exit !(value > 0.01) }' || {
    echo "$name opened a blank window" >&2
    exit 1
}
cat "$output/$name.log"
if grep -Eqi 'Aborting|EGL_BAD|failed to create.*display|WebKitWebProcess.*(crash|error)' "$output/$name.log"; then
    echo "$name reported a webview rendering failure" >&2
    exit 1
fi
