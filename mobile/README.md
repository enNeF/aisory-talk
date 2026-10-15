# AI-SORY TALK: Android and iOS app

This folder is a small **Flutter** app that hosts the AI-SORY TALK web app (the files in the parent folder)
in a full-screen WebView. The web files are bundled inside the APK/IPA, so the app:

- installs like any other app and **works offline from the first launch** (the AI Tips chat uses its
  built-in offline coach; Claude replies need internet and an API key, as on the web)
- keeps all data on the phone, in the WebView's localStorage, exactly as the web version does
- runs the **same code** as the web version: no screens or logic are rewritten

`lib/main.dart` (~150 lines) is the only Flutter code. It loads the bundled page, handles the Android back
button, keeps the WebView on the app's own pages, and sends **Settings → Export data** to the phone's share
sheet (WebViews cannot save downloads on their own).

## Why Flutter (and the alternatives)

| Option | Fit for AI-SORY TALK | Trade-offs |
|---|---|---|
| **Flutter + WebView (chosen)** | Matches the poster ("built on Flutter … across iOS and Android"). One project gives Android and iOS. Files are bundled, so it works offline on first launch. | Needs the Flutter SDK (~1.4 GB) plus the Android SDK. Uses the `flutter_inappwebview` plugin. Its last stable release (6.1.5) no longer builds on Android, so the app uses the 6.2 beta (see below). The UI is still HTML, so a later move to native Flutter screens would be a rewrite. |
| Capacitor | The most purpose-built tool for wrapping an existing web app. It serves files from `https://localhost` on both platforms. | Needs Node.js (not installed). It would contradict the poster's Flutter claim. |
| Trusted Web Activity (Bubblewrap) | Smallest APK. Runs in the user's Chrome. Good for a Play Store listing of a hosted PWA. | **Android only.** The PWA must be hosted on HTTPS with Digital Asset Links. The first launch needs internet, because it is not bundled offline. Needs Node.js, and Chrome on the phone. |

How the page is served inside the app:

- **Android:** `WebViewAssetLoader` serves the bundled files at
  `https://appassets.androidplatform.net/assets/flutter_assets/assets/www/index.html`. This is a real https
  origin, which ES modules (`<script type="module">`) need. They fail from `file://`.
- **iOS:** the plugin's `InAppLocalhostServer` serves them at `http://localhost:52173/`. The port is fixed
  because localStorage, where the app keeps its data, is tied to the origin.
- `sw.js` is not bundled. The files are already on the device, so the service worker adds nothing there.

## Build an Android APK

### Option 1: on GitHub (no installs)

`.github/workflows/mobile.yml` builds the debug APK on GitHub's machines:

1. Put the `AISORY` folder in a GitHub repository and push it.
2. Open **Actions → Mobile app** and wait for the run to finish (about 10 minutes), or start it with **Run workflow**.
3. Download **aisory-talk-debug-apk** from the run's **Artifacts** and install it on the phone.
   Android asks you to allow installs from your browser or file manager.

The same workflow also compiles the iOS app (unsigned) as a check.

### Option 2: on this Windows PC

Needs about 4 GB of downloads and roughly 9 GB of disk. That covers Flutter 1.4 GB, the Android SDK 2.7 GB
(including NDK and CMake, fetched by the first build), Gradle's cache 4.1 GB, and the JDK 0.3 GB.
Tested on 2026-10-15 with Flutter 3.47.7 and Windows 11.

1. **Install the toolchain** (Git, OpenJDK 17, Flutter stable, Android SDK command-line tools, platform 36):

   ```bash
   powershell -ExecutionPolicy Bypass -File mobile\tool\install_toolchain.ps1
   ```

   Run this from an ordinary terminal (PowerShell or Windows Terminal). The Git and JDK installers each
   show one administrator (UAC) prompt. The script also accepts the Android SDK licences for you.

   Alternatively, install [Android Studio](https://developer.android.com/studio) and
   [Flutter](https://docs.flutter.dev/get-started/install/windows/mobile) by hand.
   Run `flutter doctor` until **Android toolchain** shows a tick.

   > **Installed from the Claude desktop app?** The app runs as a packaged (MSIX) app, so Windows
   > redirects what its terminals write under `%LOCALAPPDATA%` to
   > `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Local`. That covers Flutter, the Android SDK
   > and the pub cache. Those tools then work only inside Claude. To build from your own terminal, run
   > `install_toolchain.ps1` there once. Git, the JDK and `~\.gradle` are not redirected and are reused.

2. **Open a new terminal**, then set up the project. This bundles the web app, generates `android/` and
   `ios/` with your Flutter version, sets the app name and internet permission, and makes icons:

   ```bash
   powershell -ExecutionPolicy Bypass -File mobile\tool\setup.ps1
   ```

3. **Build:**

   ```bash
   cd mobile; flutter build apk --debug
   ```

   The APK is at `mobile/build/app/outputs/flutter-apk/app-debug.apk`. It is about 155 MB, because a
   debug build includes every CPU type and the debug engine; a release build is much smaller. The first
   build takes about 20–30 minutes, mostly for Gradle to download the NDK (~700 MB). Later builds take a
   few minutes. With a phone connected by USB (USB debugging on), `flutter run` installs and starts it
   directly.

**After changing the web app**, run `mobile\tool\sync_web.ps1` (or `setup.ps1` again) before rebuilding.

### Release build (Play Store)

A debug APK is fine for demos and testers. For Google Play:

1. Create an upload key, and sign with it as described in
   [Flutter's Android deployment guide](https://docs.flutter.dev/deployment/android).
2. Build an app bundle with `flutter build appbundle`.
3. Move the Claude API call behind a small server first, so no API key lives on users' phones.

## iOS

Building for iPhone needs **macOS with Xcode**; Windows cannot do it. The project is ready for it:

- **On a Mac:** run `pwsh mobile/tool/setup.ps1` (or the equivalent steps), then `cd mobile && flutter run`
  with an iPhone connected. Choose your team under *Signing & Capabilities* in Xcode.
- **From Windows:** use a cloud Mac build service such as Codemagic or GitHub Actions `macos-latest`
  (already in the workflow, unsigned). Installing on real iPhones or TestFlight needs an Apple Developer
  account (USD 99/year) and signing certificates set up in that service.

## Known differences from the browser version

- The **Install app** banner never shows, because the app is already installed.
- Without internet, the Nunito font falls back to the phone's system font. Everything else works offline.
- Data is not shared with the browser version: each one has its own localStorage. The app can export
  data but has no import yet.

## flutter_inappwebview version

`pubspec.yaml` uses `flutter_inappwebview: ^6.2.0-beta.3`. The last stable release, 6.1.5 from October 2024,
fails to build with current Flutter:

```
`getDefaultProguardFile('proguard-android.txt')` is no longer supported
```

Its Android module (`flutter_inappwebview_android` 1.1.3) still uses that file, while 1.2.0-beta.3 does not.
`main.dart` compiles unchanged against both. When a stable 6.2.x comes out, `flutter pub upgrade` picks it up.
