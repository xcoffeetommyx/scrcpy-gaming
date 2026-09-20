#!/usr/bin/env bash
# UI-only fixture: enable controls without requiring a phone on the CI runner.
set -euo pipefail
backend=$1
shift
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT
cp -a "$backend/." "$temporary/"
cat > "$temporary/adb" <<'ADB'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" != 'devices -l' ]]; then
    echo 'The UI fixture only supports device discovery.' >&2
    exit 1
fi
echo 'List of devices attached'
if [[ -e "$SCRCPY_GO_CONNECT_MARKER" ]]; then
    echo 'ui-fixture-1 device product:test model:Test_Phone transport_id:1'
    echo 'ui-fixture-2 device product:test model:Second_Phone transport_id:2'
fi
ADB
chmod +x "$temporary/adb"
export SCRCPY_GO_BACKEND_DIR="$temporary"
export SCRCPY_GO_CONNECT_MARKER="$temporary/connected"
bash "$(dirname "$0")/smoke-linux-gui.sh" "$@"
