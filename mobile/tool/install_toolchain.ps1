# Installs what an Android build needs on Windows, without Android Studio:
#   Git + OpenJDK 17 (winget), Flutter stable (git clone), Android SDK command-line tools, platform-tools,
#   platform 36 and build-tools. Downloads about 1.5 GB here; the first Gradle build fetches about 2.5 GB more
#   (NDK, CMake, Gradle and Maven dependencies).
# Safe to re-run; it skips anything already installed. Open a NEW terminal afterwards so PATH is refreshed.
$ErrorActionPreference = 'Stop'
# Windows PowerShell 5.1 downloads very slowly while it draws a progress bar.
$ProgressPreference = 'SilentlyContinue'

$flutterDir = Join-Path $env:LOCALAPPDATA 'flutter'
$sdkDir = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$toolsZip = 'commandlinetools-win-15859902_latest.zip'
$toolsSha256 = '90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a'

function Invoke-Tool([string]$exe, [string[]]$arguments) {
  & $exe @arguments
  if ($LASTEXITCODE -ne 0) { throw "$exe $($arguments -join ' ') failed with exit code $LASTEXITCODE" }
}

function Add-UserPath([string]$dir) {
  $current = [Environment]::GetEnvironmentVariable('Path', 'User')
  if (($current -split ';') -notcontains $dir) {
    [Environment]::SetEnvironmentVariable('Path', "$current;$dir".TrimStart(';'), 'User')
  }
  if (($env:Path -split ';') -notcontains $dir) { $env:Path = "$env:Path;$dir" }
}

# Git and JDK 17 (winget may show a UAC prompt).
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  winget install --id Git.Git -e --accept-package-agreements --accept-source-agreements
  $env:Path = "$env:Path;$env:ProgramFiles\Git\cmd"
}
$jdk = Get-ChildItem "$env:ProgramFiles\Microsoft" -Directory -Filter 'jdk-17*' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $jdk) {
  winget install --id Microsoft.OpenJDK.17 -e --accept-package-agreements --accept-source-agreements
  $jdk = Get-ChildItem "$env:ProgramFiles\Microsoft" -Directory -Filter 'jdk-17*' | Select-Object -First 1
}
[Environment]::SetEnvironmentVariable('JAVA_HOME', $jdk.FullName, 'User')
$env:JAVA_HOME = $jdk.FullName

# Flutter (stable channel).
if (-not (Test-Path (Join-Path $flutterDir 'bin\flutter.bat'))) {
  # Remove a half-finished clone from an earlier failed run.
  if (Test-Path $flutterDir) { Remove-Item -Recurse -Force $flutterDir }
  # The Flutter repo contains engine paths longer than 260 characters, so long paths must be on.
  Invoke-Tool git @('clone', '-c', 'core.longpaths=true', '--depth', '1', '-b', 'stable', 'https://github.com/flutter/flutter.git', $flutterDir)
}
Add-UserPath (Join-Path $flutterDir 'bin')

# Android SDK command-line tools.
$sdkmanager = Join-Path $sdkDir 'cmdline-tools\latest\bin\sdkmanager.bat'
if (-not (Test-Path $sdkmanager)) {
  $download = Join-Path $env:TEMP $toolsZip
  Invoke-WebRequest "https://dl.google.com/android/repository/$toolsZip" -OutFile $download -UseBasicParsing
  if ((Get-FileHash $download -Algorithm SHA256).Hash -ne $toolsSha256) { throw "Checksum mismatch for $toolsZip" }
  $unpack = Join-Path $env:TEMP 'android-cmdline-tools'
  if (Test-Path $unpack) { Remove-Item -Recurse -Force $unpack }
  Expand-Archive $download $unpack
  New-Item -ItemType Directory -Force (Join-Path $sdkDir 'cmdline-tools') | Out-Null
  Move-Item (Join-Path $unpack 'cmdline-tools') (Join-Path $sdkDir 'cmdline-tools\latest')
  Remove-Item $download
}
[Environment]::SetEnvironmentVariable('ANDROID_HOME', $sdkDir, 'User')
$env:ANDROID_HOME = $sdkDir
Add-UserPath (Join-Path $sdkDir 'platform-tools')

# Accept the Android SDK licences first: without them sdkmanager silently skips the install, and Gradle
# cannot download SDK packages.
# Windows PowerShell's pipe does not reach sdkmanager's prompt, so feed the answers from a file via cmd.
$answers = Join-Path $env:TEMP 'sdk-license-answers.txt'
[IO.File]::WriteAllText($answers, ("y`r`n" * 30))
cmd /c "`"$sdkmanager`" --licenses < `"$answers`"" | Out-Null
Remove-Item $answers
# flutter build refuses to start without at least one SDK platform; 36 is Flutter's current compileSdk.
Invoke-Tool $sdkmanager @('--install', 'platform-tools', 'platforms;android-36', 'build-tools;36.0.0')
if (-not (Test-Path (Join-Path $sdkDir 'platform-tools\adb.exe'))) { throw 'platform-tools did not install.' }
Invoke-Tool flutter @('config', '--android-sdk', $sdkDir, '--jdk-dir', $jdk.FullName)
# Visual Studio / Chrome warnings in this report are fine; only the Android toolchain needs a tick.
& flutter doctor

Write-Host ''
Write-Host 'Toolchain ready. Open a new terminal, then run mobile/tool/setup.ps1.'
