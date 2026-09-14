# Scrcpy GO

**Gaming Optimized**

Scrcpy GO is the Windows-first launcher for `scrcpy-gaming`. It discovers
Android devices through the bundled ADB, lets you choose between connected
devices, applies a game mode profile, and runs the existing packaged scrcpy
client. It does not replace or embed scrcpy's video and input engine.

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
The staging script runs `scrcpy.exe --help` and rejects a backend that does not
support `--game-mode-profile`.

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
