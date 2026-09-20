#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
package=(src-tauri/target/release/bundle/deb/*.deb)
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT
dpkg-deb --extract "${package[0]}" "$temporary"
dpkg-deb --info "${package[0]}"
test -x "$temporary/usr/bin/scrcpy-go"
backend=$(find "$temporary/usr" -type d -name backend -print -quit)
test -n "$backend"
test -x "$backend/scrcpy"
test -x "$backend/adb"
test -s "$backend/scrcpy-server"
test -s "$temporary/usr/lib/udev/rules.d/70-scrcpy-go.rules"
"$backend/scrcpy" --help | grep -- --render-vsync
"$backend/adb" version
desktop=$(find "$temporary/usr/share/applications" -name '*.desktop' -print -quit)
desktop-file-validate "$desktop"
if ldd "$temporary/usr/bin/scrcpy-go" "$backend/scrcpy" "$backend/adb" | grep 'not found'; then
    echo 'Missing runtime library' >&2
    exit 1
fi
# A healthy GUI remains open until timeout. A startup crash exits sooner.
set +e
SCRCPY_GO_BACKEND_DIR="$backend" timeout 12s dbus-run-session -- xvfb-run -a "$temporary/usr/bin/scrcpy-go" > "$temporary/launch.log" 2>&1
status=$?
set -e
cat "$temporary/launch.log"
test "$status" = 124
echo 'Linux package and graphical launch smoke test passed.'
