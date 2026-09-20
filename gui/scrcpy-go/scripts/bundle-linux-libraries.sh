#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
backend="$PWD/release/work/build-linux-x86_64/dist"
test -x "$backend/scrcpy"
test -x "$backend/adb"
mkdir -p "$backend/licenses"
# Bundle the client/ADB dependencies too: the GUI bundler only discovers the
# launcher's dependencies. Keep glibc supplied by the host distribution.
mapfile -t libraries < <(ldd "$backend/scrcpy" "$backend/adb" | awk '/=> \// {print $3}' | sort -u)
for library in "${libraries[@]}"; do
    name=$(basename "$library")
    case "$name" in
        libc.so.*|libm.so.*|libpthread.so.*|libdl.so.*|librt.so.*|libresolv.so.*) continue ;;
    esac
    cp -L "$library" "$backend/$name"
    patchelf --set-rpath '$ORIGIN' "$backend/$name"
    package=$(dpkg-query -S "$library" 2>/dev/null | head -n1 | cut -d: -f1 || true)
    if [[ -n "$package" && -f "/usr/share/doc/$package/copyright" ]]; then
        cp "/usr/share/doc/$package/copyright" "$backend/licenses/$package.txt"
    fi
done
patchelf --set-rpath '$ORIGIN' "$backend/scrcpy"
patchelf --set-rpath '$ORIGIN' "$backend/adb"
for project in app/deps/work/sources/{sdl,dav1d,ffmpeg,libusb}-*; do
    [[ -d "$project" ]] || continue
    for license in "$project"/COPYING* "$project"/LICENSE*; do
        [[ -f "$license" ]] || continue
        cp "$license" "$backend/licenses/$(basename "$project")-$(basename "$license")"
    done
done
if ldd "$backend/scrcpy" "$backend/adb" | grep 'not found'; then
    echo 'A backend runtime dependency is missing' >&2
    exit 1
fi
