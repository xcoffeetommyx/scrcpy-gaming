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

New-Item -ItemType Directory -Path $Destination -Force | Out-Null
Get-ChildItem -LiteralPath $Destination -Force | Remove-Item -Recurse -Force
Copy-Item -Path (Join-Path $Source "*") -Destination $Destination -Recurse -Force
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
