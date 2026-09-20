# Scrcpy GO

**Gaming Optimized**

Scrcpy GO is the Windows and Linux desktop launcher for `scrcpy-gaming`. It discovers
Android devices through the bundled ADB, lets you choose between connected
devices, applies a game mode profile, and runs the existing packaged scrcpy
client. It does not replace or embed scrcpy's video and input engine.

Each device has an independent mirroring session. You may switch the device
selector and launch or stop another device without closing existing sessions.

## Download and install

Get the installer from [GitHub Releases](https://github.com/xcoffeetommyx/scrcpy-gaming/releases).
Use the Windows `.exe`, the Linux `.deb` for Lubuntu/Ubuntu/Debian, or the Linux
AppImage for other compatible Intel/AMD 64-bit desktops. Source-code archives
are not installers. See each release's testing notes before choosing a preview.

On Lubuntu, open the `.deb` with the graphical package installer, approve
installation, and open **Scrcpy GO** from the application menu. USB access rules
are installed with the package; reconnect the phone after installation.

For AppImage, enable **Allow executing file as program** in your file manager's
Properties/Permissions and open the file. If the phone needs USB access, expand
**Linux USB connection help** inside the app and click **Set up USB access**.
Approve the graphical administrator prompt and reconnect the phone. This uses
the desktop's PolicyKit service and udev; it does not run the whole app as root.
The USB rule grants access to the active local desktop user, not every account.
AppImages require a compatible glibc-based desktop and AppImage/FUSE support;
some distributions need their FUSE 2 compatibility package installed through
the software manager. The `.deb` is recommended for Lubuntu.

Linux builds use Ubuntu 22.04 as their compatibility baseline. The initial
target is Lubuntu 24.04 x86_64; ARM, 32-bit Linux, and musl-based distributions
are not covered. Wayland compositors control display presentation and may
emulate exclusive fullscreen. Use an X11 session when actual display mode
switching is needed. Audio, controllers, and graphics still require testing
on the destination hardware.

## Building Linux packages (developers)

The **Scrcpy GO desktop packages** GitHub Actions workflow builds the customized
C client and Android server, tests the launcher, and produces `.deb` and
AppImage artifacts on Ubuntu 22.04. It verifies packaged executables, desktop
integration, shared libraries, and GUI startup under a virtual X display.
These checks do not replace gameplay and USB testing on a physical Linux PC.

For local builds, install the Linux dependencies listed in
`.github/workflows/scrcpy-go.yml`, plus Node 24, Rust, JDK 17 and the Android SDK.
Build `release/build_linux.sh x86_64` and the Android server, then copy the
server APK to `release/work/build-linux-x86_64/dist/scrcpy-server`.
From `gui/scrcpy-go`, run `npm ci` and `npm run tauri build`.
Then run `bash scripts/finalize-appimage.sh` to keep the AppImage's graphics
driver dependencies compatible with newer desktops. This uses Tauri's cached
AppImage packaging tool and removes the stale bundled Wayland client library.
The cross-platform staging script validates and bundles that backend. Use
`SCRCPY_GO_BACKEND_DIR` to supply a different distribution directory.

Packaged resources use platform-specific executable names; development falls
back to `release/work/build-linux-x86_64/dist` on Linux. Linux-specific Tauri
settings live in `src-tauri/tauri.linux.conf.json`; Windows retains NSIS and its
existing upgrade hooks.

## Gaming display modes

Choose a connected device, a performance profile, and a **Display mode**:

- **Phone native** mirrors the physical screen with the profile's usual stream
  resolution cap.
- **16:9 Gaming** creates a 1920 × 1080 Android virtual display.
- **16:9 Performance** creates a 1280 × 720 Android virtual display.
- **Custom resolution** creates a display with your chosen width and height
  (320–8192 pixels per dimension, in multiples of 8).

Virtual modes change the Android render target using `--new-display`, so apps
can render at the selected aspect ratio. They do not stretch the image or change
the physical phone's resolution. The launcher passes `--max-size=0` to override
the gaming profile's longest-edge cap, and `--keep-active` to keep the virtual
display awake. Profile frame-rate, bitrate, audio, and controller settings still
apply. Larger displays need more GPU and encoder capacity; a frame-rate target
is not guaranteed.

The optional **Start an app** field accepts an installed Android package name.
Leave it blank to use the device's virtual-display launcher. Some phones do not
provide one: if the display stays blank, stop the session and enter an app's
package name. There are no game-specific shortcuts. Apps and Android versions
vary in virtual-display support, orientation, and controller focus; use Phone
native if an app cannot run correctly on a separate display.

Settings are independent per device for the current launcher session. Stop
mirroring before changing them. Save your game first: scrcpy destroys the
virtual display and its running apps when the display closes.

## Phone screen off

**Phone screen → Off while streaming** (default) turns off the physical panel
while keeping the stream active. Unlock the phone before starting. This is
screen blanking, not PIN/fingerprint locking: the phone remains unlocked.
The launcher passes `--turn-screen-off --stay-awake`; the latter prevents
automatic sleep while charging, and scrcpy restores the charging sleep setting
and physical panel on exit. Virtual displays also retain `--keep-active`.

Use **Leave on** to opt out. During a session, **Alt+O** turns the phone panel
off and **Alt+Shift+O** turns it back on. These shortcuts do not change the
preference for the next launch. The physical power button invokes Android's
normal sleep/lock behavior, which may suspend the virtual display too. This
was observed on the connected Samsung S23+ running Android 16; panel-only
screen off kept its virtual display playing while the physical panel was off.

## Fullscreen and frame pacing

**Window mode** offers Windowed, Borderless fullscreen, and Exclusive fullscreen.
Exclusive mode uses SDL's explicit monitor display mode at the desktop resolution.
Smooth modes request a matching 60 or 120 Hz refresh rate; SDL chooses the closest
supported mode. The actual resolution/rate is written to Activity. Alt+F leaves
or re-enters fullscreen, and leaving restores the desktop mode. Unsupported
exclusive mode falls back to borderless with a warning. Windows/driver fullscreen
optimizations may still affect how fullscreen is presented.

**Frame pacing** is independent of the image/audio profile:

- **Smooth 60 FPS** (default): 60 FPS capture cap, 35 ms timestamp-based video
  buffer, and presentation VSync. Start here for games capped at 60 FPS.
- **Smooth 120 FPS**: 120 FPS cap, 20 ms video buffer, and VSync. Requires a game,
  Android display, encoder, and monitor capable of delivering that rate.
- **Minimum latency**: up to 120 FPS, no video buffer, and default VSync-off
  presentation. This preserves the original low-latency behavior.

The buffer absorbs delivery jitter at the cost of its configured delay. VSync
may add more delay. Match the in-game frame cap to the selected mode. In windowed
or borderless mode, use a monitor refresh rate equal to or an integer multiple
of that cap (for example, 60 FPS on a 60/120 Hz monitor). A video buffer cannot
repair slow game frames, encoder stalls, or sustained transport/decoder overload.

The session reports average and longest frame intervals over the last second,
measured after the client's presentation calls return. These help reveal uneven
delivery hidden by an FPS average; they do not measure actual monitor scanout or
end-to-end input latency. Static screens, startup, and app loading naturally
produce long intervals. Compare steady motion after the game has loaded.

Launcher sessions enable scrcpy's FPS counter and show a live per-device
rendered FPS and skipped-frame sample. Counter lines are kept out of the
activity log so that useful startup and controller diagnostics are not pushed
out by one-second telemetry. These figures measure frame delivery and pacing;
they are not presented as end-to-end latency because the Android capture clock
is not synchronized with the host clock.

## Prerequisites

- Windows 10 or Windows 11
- Node.js 22 or newer
- Rust with the stable MSVC toolchain
- Visual Studio Build Tools with **Desktop development with C++**
- Microsoft Edge WebView2 Runtime
- A completed Win64 scrcpy distribution at
  `release/work/build-win64/dist`

The distribution must contain at least `scrcpy.exe`, `adb.exe`, and
`scrcpy-server`, along with the DLLs already produced by the scrcpy release
build.

## Install dependencies

From `gui/scrcpy-go`:

```powershell
npm install
```

## Build and stage the backend

Build the current Win64 scrcpy backend first. Confirm that
`release/work/build-win64/dist` contains the newly built `scrcpy.exe`,
`adb.exe`, and `scrcpy-server`, then stage it:

```powershell
.\scripts\stage-backend.ps1
```

For a distribution in another location:

```powershell
.\scripts\stage-backend.ps1 -Source C:\path\to\scrcpy\dist
```

Staged binaries are generated content and are ignored by Git.
The staging script runs `scrcpy.exe --help` and rejects a backend missing the
game profile, exclusive fullscreen, or presentation VSync flags.

During development, the launcher resolves the backend in this order:

1. `SCRCPY_GO_BACKEND_DIR`
2. Packaged Tauri resources
3. The repository's `release/work/build-win64/dist`

## Run in development

```powershell
npm run tauri dev
```

## Tests and checks

```powershell
npm test
npm run build
cd src-tauri
cargo test
cargo check
```

## Build the Windows launcher

Always build scrcpy first, stage that backend, and only then build the launcher:

```powershell
.\scripts\stage-backend.ps1
npm run tauri build
```

The Tauri build runs the staging preflight again and stops before packaging if
the distribution is missing or outdated.

Tauri produces the configured NSIS installer under
`src-tauri/target/release/bundle/nsis`.

Installer and uninstaller hooks release the bundled backend before replacing
or removing files. ADB's background server can remain alive after the launcher
closes and lock `AdbWinApi.dll`. The hook closes the launcher first, then stops
only `adb.exe` and `scrcpy.exe` processes whose executable paths match this
installation's `backend` directory. ADB processes from other SDKs or scrcpy
installations are left alone. Save games before upgrading because active
mirroring sessions will close.

The launcher, browser favicon, and installer icons use `assets/icon.svg` as
their source. After editing it, regenerate the packaged platform icons with
`npm run tauri -- icon assets/icon.svg` before building the installer.
