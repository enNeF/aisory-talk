# Copies the web app from the repo root into mobile/assets/www so Flutter bundles it.
# Run again after every change to the web app. Works in Windows PowerShell 5.1 and pwsh (macOS/Linux CI).
$ErrorActionPreference = 'Stop'

$mobile = Split-Path -Parent $PSScriptRoot
$web = Split-Path -Parent $mobile
$www = Join-Path (Join-Path $mobile 'assets') 'www'

if (Test-Path $www) { Remove-Item -Recurse -Force $www }
New-Item -ItemType Directory -Force $www | Out-Null

# sw.js is left out on purpose: the files are already on the device, and the service worker cannot
# fetch from the WebView's local asset origin.
foreach ($file in 'index.html', 'manifest.webmanifest') {
  Copy-Item (Join-Path $web $file) $www
}
foreach ($dir in 'css', 'js', 'icons') {
  Copy-Item -Recurse (Join-Path $web $dir) $www
}

Write-Host "Web app copied to $www"
