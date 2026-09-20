param(
    [Parameter()]
    [string]$Source
)

$ErrorActionPreference = "Stop"

$AppRoot = Split-Path -Parent $PSScriptRoot
$RepoRoot = [IO.Path]::GetFullPath((Join-Path $AppRoot "..\.."))

if (-not $Source) {
    $Source = Join-Path $RepoRoot "release\work\build-win64\dist"
}

$Source = [IO.Path]::GetFullPath($Source)
$Destination = [IO.Path]::GetFullPath(
    (Join-Path $AppRoot "src-tauri\resources\backend")
)

if ($Source -ieq $Destination) {
    throw "Backend source and staging destination must be different folders."
}

if (-not (Test-Path -LiteralPath $Source -PathType Container)) {
    throw "Backend distribution not found: $Source"
}

$required = @("scrcpy.exe", "adb.exe", "scrcpy-server")
$missing = $required | Where-Object {
    -not (Test-Path -LiteralPath (Join-Path $Source $_) -PathType Leaf)
}
if ($missing) {
    throw "Backend distribution is incomplete. Missing: $($missing -join ', ')"
}

$scrcpy = Join-Path $Source "scrcpy.exe"
$startInfo = [Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = $scrcpy
$startInfo.Arguments = "--help"
$startInfo.WorkingDirectory = $Source
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true

$process = [Diagnostics.Process]::new()
$process.StartInfo = $startInfo
try {
    if (-not $process.Start()) {
        throw "scrcpy.exe did not start."
    }
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $exitCode = $process.ExitCode
    $help = $stdout.Result + $stderr.Result
} catch {
    throw "Could not validate '$scrcpy --help': $($_.Exception.Message)"
} finally {
    $process.Dispose()
}

if ($exitCode -ne 0) {
    throw "Backend validation failed: scrcpy.exe --help exited with code $exitCode."
}

foreach ($flag in @("--game-mode-profile", "--fullscreen-exclusive", "--render-vsync")) {
    if ($help -notmatch [regex]::Escape($flag)) {
        throw "Backend is outdated. Build the current scrcpy backend before staging. Missing $flag."
    }
}

New-Item -ItemType Directory -Path $Destination -Force | Out-Null
Get-ChildItem -LiteralPath $Destination -Force | Remove-Item -Recurse -Force
Get-ChildItem -LiteralPath $Source -Force |
    Copy-Item -Destination $Destination -Recurse -Force
New-Item -ItemType File -Path (Join-Path $Destination ".gitkeep") -Force |
    Out-Null

$count = (
    Get-ChildItem -LiteralPath $Destination -File -Recurse |
        Where-Object { $_.Name -ne ".gitkeep" }
).Count
Write-Host "Staged $count backend files from:"
Write-Host "  $Source"
Write-Host "into:"
Write-Host "  $Destination"
