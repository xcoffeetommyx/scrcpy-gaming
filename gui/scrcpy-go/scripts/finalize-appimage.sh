#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
bundle=$(realpath src-tauri/target/release/bundle/appimage)
appdir="$bundle/Scrcpy GO.AppDir"
test -d "$appdir/usr/lib"
# Mesa loads the host's graphics drivers. Shipping an older Wayland client
# breaks newer Mesa with undefined wl_* symbols and leaves WebKit blank.
# GTK/Mesa desktops provide this library; keep it matched to their drivers.
find "$appdir/usr/lib" -maxdepth 1 -name 'libwayland-client.so*' -delete
# Use the reliable WebKit path for the settings window. The separate SDL
# mirroring window is unaffected. Preserve explicit advanced-user overrides.
test "$(head -c 2 "$appdir/AppRun")" = '#!'
sed -i '2i\export WEBKIT_DISABLE_DMABUF_RENDERER="${WEBKIT_DISABLE_DMABUF_RENDERER:-1}"\nexport WEBKIT_DISABLE_COMPOSITING_MODE="${WEBKIT_DISABLE_COMPOSITING_MODE:-1}"' "$appdir/AppRun"
plugin=$(find "${XDG_CACHE_HOME:-$HOME/.cache}/tauri" -maxdepth 1 -name 'linuxdeploy-plugin-appimage*.AppImage' -print -quit)
test -n "$plugin"
images=("$bundle"/*.AppImage)
test "${#images[@]}" = 1
temporary="$bundle/repacked.AppImage"
LDAI_OUTPUT="$temporary" ARCH=x86_64 APPIMAGE_EXTRACT_AND_RUN=1 "$plugin" --appdir "$appdir"
test -s "$temporary"
mv "$temporary" "${images[0]}"
