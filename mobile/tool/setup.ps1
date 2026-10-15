# One-time (and repeatable) project setup: bundles the web app, generates the Android/iOS platform
# folders with the installed Flutter version, applies the settings the app needs, and creates icons.
# Needs Flutter on PATH. Works in Windows PowerShell 5.1 and pwsh (macOS/Linux CI).
$ErrorActionPreference = 'Stop'

$mobile = Split-Path -Parent $PSScriptRoot

function Invoke-Tool([string]$exe, [string[]]$arguments) {
  & $exe @arguments
  if ($LASTEXITCODE -ne 0) { throw "$exe $($arguments -join ' ') failed with exit code $LASTEXITCODE" }
}

function Edit-TextFile([string]$path, [scriptblock]$change) {
  $text = [IO.File]::ReadAllText($path)
  $updated = & $change $text
  if ($updated -ne $text) {
    [IO.File]::WriteAllText($path, $updated, (New-Object Text.UTF8Encoding $false))
    Write-Host "Updated $path"
  }
}

if (-not (Get-Command flutter -ErrorAction SilentlyContinue)) {
  throw 'Flutter is not on PATH. Install it first (see mobile/README.md, or run tool/install_toolchain.ps1 on Windows).'
}

Push-Location $mobile
try {

# 1. Bundle the web app.
& (Join-Path $PSScriptRoot 'sync_web.ps1')

# 2. Generate the platform folders (only files that are missing; lib/main.dart and pubspec.yaml are kept).
if (-not (Test-Path 'android') -or -not (Test-Path 'ios')) {
  Invoke-Tool flutter @('create', '--org', 'my.edu.uniten', '--project-name', 'aisory_talk', '--platforms', 'android,ios', '.')
  # The generated sample test targets the counter demo, which this project does not have.
  $sampleTest = Join-Path 'test' 'widget_test.dart'
  if (Test-Path $sampleTest) { Remove-Item $sampleTest }
}

# 3. Android: app name, and internet access for the optional Claude chat (flutter create only adds it
#    to debug builds).
Edit-TextFile (Join-Path $mobile 'android/app/src/main/AndroidManifest.xml') {
  param($xml)
  $xml = $xml -replace 'android:label="[^"]*"', 'android:label="AI-SORY TALK"'
  if ($xml -notmatch 'android.permission.INTERNET') {
    $xml = $xml -replace '(<manifest[^>]*>)', "`$1`n    <uses-permission android:name=`"android.permission.INTERNET`"/>"
  }
  $xml
}

# 4. iOS: app name, and permission to load the app from the in-app localhost server.
Edit-TextFile (Join-Path $mobile 'ios/Runner/Info.plist') {
  param($plist)
  $plist = $plist -replace '(<key>CFBundleDisplayName</key>\s*<string>)[^<]*(</string>)', '${1}AI-SORY TALK${2}'
  if ($plist -notmatch 'NSAllowsLocalNetworking') {
    $ats = "`t<key>NSAppTransportSecurity</key>`n`t<dict>`n`t`t<key>NSAllowsLocalNetworking</key>`n`t`t<true/>`n`t</dict>`n"
    $plist = $plist -replace '(</dict>\s*</plist>)', "$ats`$1"
  }
  $plist
}

# 5. Packages and launcher icons (from the web app's icon-512.png).
Invoke-Tool flutter @('pub', 'get')
Invoke-Tool dart @('run', 'flutter_launcher_icons')
} finally {
  Pop-Location
}

Write-Host ''
Write-Host 'Setup done. Build a debug APK with:  flutter build apk --debug'
