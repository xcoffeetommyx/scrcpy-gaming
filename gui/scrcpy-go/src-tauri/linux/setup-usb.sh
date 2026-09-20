#!/bin/sh
set -eu
[ "$(id -u)" = 0 ] || { echo 'Administrator authorization is required.' >&2; exit 1; }
[ "$#" = 0 ] || exit 1
command -v udevadm >/dev/null 2>&1 || { echo 'This system needs udev USB support.' >&2; exit 1; }
install -d -m 755 /etc/udev/rules.d
# The content and destination are fixed; no caller-controlled root commands.
cat > /etc/udev/rules.d/70-scrcpy-go.rules <<'RULES'
# Grant the active local desktop user access to Android USB debugging devices.
SUBSYSTEM=="usb", ENV{DEVTYPE}=="usb_device", IMPORT{builtin}="usb_id"
SUBSYSTEM=="usb", ENV{DEVTYPE}=="usb_device", ENV{ID_USB_INTERFACES}=="*:ff4201:*", TAG+="uaccess"
RULES
chmod 644 /etc/udev/rules.d/70-scrcpy-go.rules
udevadm control --reload-rules
