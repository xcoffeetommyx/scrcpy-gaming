# Scrcpy GO

**Gaming Optimized**

Scrcpy GO is the Windows-first launcher for `scrcpy-gaming`. It discovers
Android devices through the bundled ADB, applies a game mode profile, and runs
the existing packaged scrcpy client. It does not replace or embed scrcpy's
video and input engine.

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

## Stage the backend

Build the Win64 scrcpy distribution first, then run:

```powershell
.\scripts\stage-backend.ps1
```

For a distribution in another location:

```powershell
.\scripts\stage-backend.ps1 -Source C:\path\to\scrcpy\dist
```

Staged binaries are generated content and are ignored by Git.

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

Stage the backend, then run:

```powershell
npm run tauri build
```

Tauri produces the configured NSIS installer under
`src-tauri/target/release/bundle/nsis`.
