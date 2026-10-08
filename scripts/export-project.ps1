# Packs this repo for Codex, including files git ignores (.env, deployments, web/dist, server/dist).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$stage = Join-Path $env:TEMP ("ribbon-export-" + [guid]::NewGuid().ToString("n"))
$destDir = Join-Path $root "export"
$zip = Join-Path $destDir "ribbon-full.zip"

New-Item -ItemType Directory -Force -Path $destDir | Out-Null
if (Test-Path $zip) { Remove-Item -Force $zip }
New-Item -ItemType Directory -Force -Path $stage | Out-Null

& robocopy $root $stage /E /NFL /NDL /NJH /NJS /NC /NS /NP /XD node_modules export artifacts cache typechain-types coverage /XF *.log
$robocopyCode = $LASTEXITCODE
if ($robocopyCode -ge 8) {
  throw "robocopy failed with exit $robocopyCode"
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
# Compress-Archive skips hidden folders, including .git.
[System.IO.Compression.ZipFile]::CreateFromDirectory(
  $stage,
  $zip,
  [System.IO.Compression.CompressionLevel]::Optimal,
  $false
)
Remove-Item -Recurse -Force $stage

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($zip)
$names = @($archive.Entries | ForEach-Object { $_.FullName.Replace("\", "/") })
$archive.Dispose()

$required = @(
  ".env",
  "AGENTS.md",
  "README.md",
  "package.json",
  "package-lock.json",
  "contracts/Ribbon.sol",
  "deployments/5042.json",
  "supabase/schema.sql",
  "web/dist/index.html",
  "server/dist/index.js",
  "web/vite.config.ts",
  "server/src/index.ts",
  ".git/HEAD"
)
$missing = @($required | Where-Object { $names -notcontains $_ })
if ($missing.Count -gt 0) {
  throw ("Export is missing: " + ($missing -join ", "))
}

$bytes = (Get-Item $zip).Length
Write-Output "zip=$zip"
Write-Output "bytes=$bytes"
Write-Output "entries=$($names.Count)"
Write-Output "required=ok"
