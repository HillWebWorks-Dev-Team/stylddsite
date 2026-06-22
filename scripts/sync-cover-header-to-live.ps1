# Sync cover / Full screen header assets into templatesite/ mirror for Site AI deploy refs.
# Vercel serves from the repo root — these files are the live template source of truth.

$ErrorActionPreference = 'Stop'
$Root = Resolve-Path (Join-Path $PSScriptRoot '..')
$DestRoot = Join-Path $Root 'templatesite'

$Files = @(
  'css/styles.css',
  'js/profile-content.js',
  'js/tenant-site.js',
  'js/styld-tenant-shared.js',
  'tenant/profile.html',
  'tenant/book.html',
  'middleware.js'
)

$Markers = @(
  '.profile-hero--cover',
  'page-cover-splash',
  'profile-nav--cover-splash',
  '--hero-cover-blur',
  '--text-splash-brand'
)

Write-Host "Styld cover header sync"
Write-Host "Root: $Root"
Write-Host ""

foreach ($rel in $Files) {
  $src = Join-Path $Root $rel
  if (-not (Test-Path $src)) {
    throw "Missing required file: $rel"
  }

  $dest = Join-Path $DestRoot $rel
  $destDir = Split-Path $dest -Parent
  if (-not (Test-Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
  }

  Copy-Item -Path $src -Destination $dest -Force
  Write-Host "Synced $rel -> templatesite/$rel"
}

$cssPath = Join-Path $Root 'css/styles.css'
$css = Get-Content -Raw -Path $cssPath
foreach ($marker in $Markers) {
  if ($css -notmatch [regex]::Escape($marker)) {
    throw "css/styles.css is missing cover marker: $marker"
  }
}

Write-Host ''
Write-Host 'OK - cover header files synced and validated.'
Write-Host 'Next: commit, push, and let Vercel deploy the repo root.'
Write-Host 'Then hard-refresh tenant site (Ctrl+Shift+R) and test / and /book.'
