# Mobile App Setup

The mobile app is a React Native app using Expo and a custom dev client. Expo Go is not enough because the app uses native modules such as BLE.

Use this page for one-time setup. For running the app, see:

- [Run on Android emulator](run-emulator.md)
- [Run on WiFi Android phone](run-phone.md)

## Prerequisites

| Tool | Notes |
|------|-------|
| Node.js 20+ | React Native 0.81 requires Node `>=20.19.4`. |
| Watchman | Recommended for Metro file watching on macOS. |
| JDK 21 | Worked locally with Gradle/Expo. JDK 25 failed Gradle plugin resolution. |
| Android Studio | Provides Android SDK, platform tools, emulator, and build tools. |

On macOS, install the common tools with:

```bash
brew install node watchman
```

Install Android Studio from [developer.android.com/studio](https://developer.android.com/studio), then open it once and install an Android SDK, platform tools, build tools, and at least one Android virtual device if you plan to use the emulator.

## Android Environment

If Android SDK tools and Java are not already exported in your shell, add this to `~/.zshrc` or equivalent:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export JAVA_HOME="$HOME/Library/Java/JavaVirtualMachines/temurin-21.0.10/Contents/Home"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
```

Reload the shell:

```bash
source ~/.zshrc
```

Check the tools:

```bash
java -version
adb devices
emulator -list-avds
```

If `adb` or `emulator` are not on `PATH`, use their macOS SDK paths directly:

```bash
"$HOME/Library/Android/sdk/platform-tools/adb" devices
"$HOME/Library/Android/sdk/emulator/emulator" -list-avds
```

## Project Setup

Create local env files from the repo root:

```bash
cp .env.example .env
cp mobile/.env.example mobile/.env
```

Install mobile dependencies:

```bash
cd mobile
npm ci
```

Use `npm install` only when intentionally updating `package-lock.json`.

## Backend Dependency

The mobile app expects the backend to be running for voice transcription and food search. From the repo root:

```bash
cd db
docker compose up -d

cd ../backend
npm run dev
```

Wait for the backend to report database, embedding model, voice model, and server readiness.

## Metro Troubleshooting

If Metro reports missing `ansi-regex`, `pretty-format`, or SHA-1 errors for files under `node_modules`, restart it with cache clearing:

```bash
cd mobile
npx expo start --dev-client --clear
```

The repo includes `mobile/metro.config.js` and small dev-only shims for these React Native dev-server dependencies so Android bundling works reliably with the current Expo/RN dependency set.
