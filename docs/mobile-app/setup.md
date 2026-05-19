# Mobile app — dev environment setup

React Native (Expo, custom dev build). Target: Android (iOS possible later).

## Prerequisites

| Tool | Install | Notes |
|------|---------|-------|
| Node.js 18+ | `brew install node` or [nodejs.org](https://nodejs.org) | LTS recommended |
| Watchman | `brew install watchman` | File watcher for Metro bundler |
| JDK 17 | `brew install --cask zulu@17` | Required by Android Gradle |
| Android Studio | [developer.android.com/studio](https://developer.android.com/studio) | Needed for Android SDK, platform tools, and emulator (optional) |

### Android SDK setup

After installing Android Studio, open it once and let it download:

- Android SDK Platform 34
- Android SDK Build-Tools 34.x
- Android SDK Platform-Tools

Then add to `~/.zshrc` (or equivalent):

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator
```

Reload the shell: `source ~/.zshrc`

### Expo & EAS CLIs

```bash
npm install -g expo-cli eas-cli
```

## Project setup

From the repo root:

```bash
cd mobile
npm install
```

This installs all JS dependencies including:

- `expo` — framework and dev tooling
- `expo-dev-client` — custom dev client (needed because Expo Go can't run BLE)
- `react-native-ble-plx` — BLE communication with the scale
- `@react-native-voice/voice` — on-device speech recognition

## Build & run

Connect an Android device via USB (with USB debugging enabled) or start an emulator, then:

```bash
npx expo run:android
```

First run generates the `android/` folder (prebuild) and compiles native code — takes a few minutes. Subsequent builds are incremental and much faster.

After the dev client is installed, start the JS bundler with:

```bash
npx expo start --dev-client
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `ANDROID_HOME` not set | Add the export lines above to `~/.zshrc` and reload |
| `adb: command not found` | Ensure `$ANDROID_HOME/platform-tools` is on PATH |
| Build fails on JDK version | Verify `java -version` shows 17; uninstall other JDKs or set `JAVA_HOME` |
| Device not detected | Enable USB debugging in Android developer options; try `adb devices` |
| Metro bundler port conflict | Kill other Metro instances or use `npx expo start --port 8082` |
