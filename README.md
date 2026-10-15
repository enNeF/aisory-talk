# AI-SORY TALK

AI-assisted mobile intervention system for early speech delay and autism support in toddlers
(ITEX 2026 · Invention ID UNITEN00016 · Copyright DV2026E02640).

A mobile-first, installable web app (PWA). It works on Android, iOS and desktop browsers, runs offline,
and keeps all data on the device.

## Screens (from the ITEX storyboard)

| Screen | What it does |
|---|---|
| **Dashboard** | Today's progress, Speech / Sensory / Social rings vs. daily goal, last-7-day speech attempts, gesture use and engagement with trends, suggested next activity, recent activities |
| **AI Recommendations** | Gen-AI style recommender ranks 15 activities using weekly practice balance, the parent's support focus, how the child responded before (mood + engagement), age and variety. Each card says *why* it was picked. Plus an AI Insight. |
| **AI Tips Chat** | Parents ask "what do I do now?". Uses the built-in offline coach (English + common Malay keywords), or Claude when an API key is added in Settings. Replies link straight to matching activities. |
| **Guided Exercises** | Step-by-step activities with a timer, then a quick observation form (mood, speech attempts, gestures, engagement) that logs the session automatically |
| **Activity Log** | Manual entries with date, activity, category, duration, mood, speech attempts, gestures, engagement and notes |
| **Progress** | Weekly minutes, sessions, active days, speech-attempt and engagement charts, category breakdown, week-by-week navigation, and a practice-based skill-gap check (predictive monitoring) |
| **Settings** | Profile, daily goal, Claude API key, install, export data (JSON), demo data, reset |

Use **"Try the demo (Luna, 26 months)"** on the first screen to fill the app with two weeks of sample data for a booth demo.

## Run it locally

Requires Python 3 (already installed):

```bash
python -m http.server 5173 --bind 127.0.0.1
```

Then open http://localhost:5173.

## Put it on a phone

Live site: **https://ai-sory-talk.netlify.app** (hosted on Netlify).

Installing as an app and offline mode need HTTPS. Publish only the web app files, not the whole
project folder (which also holds `mobile/`, `.claude/` and `.github/`). Refresh the `dist` folder
with them:

```bash
powershell -Command "Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue; New-Item -ItemType Directory dist | Out-Null; Copy-Item -Recurse index.html,manifest.webmanifest,sw.js,css,js,icons dist"
```

To update the live site, open the site in Netlify → **Deploys** and drag the `dist` folder onto the
drop area. Phones pick up the new version the next time the app is opened online.

Open the URL on the phone, then **Add to Home Screen** (iOS Safari) or **Install app** (Android Chrome).

## Android / iOS app (Flutter)

`mobile/` packages this web app as a Flutter app for an installable APK (and an iOS build on a Mac).
The app works offline from the first launch. See [mobile/README.md](mobile/README.md) for the build
steps. There is also a GitHub Actions workflow that builds the APK with no local installs.

## Claude assistant (optional)

Without a key the chat uses the offline coach. To enable Claude, paste an Anthropic API key in
**Settings → AI assistant**. The key is stored only in that browser and requests go directly to
Anthropic (model `claude-opus-5-5`). This direct-from-browser setup is fine for a prototype on your
own device; for a public release, move the call behind a small server so the key isn't on users' phones.

## Project layout

```
index.html            app shell
css/styles.css        styles
js/app.js             screens, router, interactions
js/ai.js              analytics, recommender, insights, skill-gap check, offline coach, Claude chat
js/data.js            activity library, moods, coaching knowledge base
js/store.js           on-device storage (localStorage) + demo data
sw.js                 offline cache
manifest.webmanifest  install metadata
icons/                app icons
mobile/               Flutter app that bundles the files above for Android/iOS
.github/workflows/    cloud build of the Android APK
```

AI-SORY TALK supports, and does not replace, professional assessment and therapy.
