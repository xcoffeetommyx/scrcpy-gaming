param(
    [Parameter(Mandatory = $true)]
    [string]$InstallDirectory
)

$ErrorActionPreference = "Stop"

try {
    $backendDirectory = [IO.Path]::GetFullPath(
        (Join-Path $InstallDirectory "backend")
    )
    $ownedPaths = @(
        (Join-Path $backendDirectory "adb.exe"),
        (Join-Path $backendDirectory "scrcpy.exe")
    )

    # ADB's server outlives the launcher and keeps its DLLs mapped. Stop only
    # executables from this installation, never another SDK's ADB server.
    # Do not use `adb kill-server`: it targets the shared port regardless of
    # which adb.exe owns the server.
    $candidates = @(Get-Process -Name adb, scrcpy -ErrorAction SilentlyContinue)
    foreach ($candidate in $candidates) {
        if ($candidate.HasExited) {
            continue
        }
        $executablePath = $candidate.Path
        if (-not $executablePath -or $ownedPaths -notcontains $executablePath) {
            continue
        }
        Write-Output "Stopping $($candidate.ProcessName) from this installation."
        # Use the original Process object rather than looking up a recycled ID.
        try {
            $candidate.Kill()
            if (-not $candidate.WaitForExit(5000)) {
                throw "Timed out waiting for $executablePath to stop."
            }
        } catch {
            if (-not $candidate.HasExited) {
                throw
            }
        }
    }
    Write-Output "Scrcpy GO backend files are ready."
    exit 0
} catch {
    Write-Output "Could not stop Scrcpy GO backend: $($_.Exception.Message)"
    exit 1
}
