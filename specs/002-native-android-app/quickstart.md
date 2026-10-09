# Quickstart: Native Android App

How to build, run, and validate the native app in `android/`.

## Prerequisites

- Android Studio with SDK platform 36 installed.
- Gradle runs on Android Studio's JDK 21:
  `export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`
- An Android 14+ phone with USB debugging, or an emulator (no Bluetooth scale on the emulator; use mock mode).
- The backend running locally: `cd backend && npm run dev`. The port is `PORT` in the repository `.env`; the app's default URL expects 8888, as the React Native app does.

## Configure the backend URL

Emulator: the default `http://10.0.2.2:8888` works.

Phone on the same Wi-Fi: add to `android/local.properties`:

```properties
talk2scale.apiBaseUrl=http://<your-mac-ip>:8888
```

## Build and install

```bash
cd android
./gradlew :app:assembleDebug :app:lintDebug
./gradlew :app:installDebug
```

The app installs as `dev.talk2scale.android`, next to the legacy React Native app (`dev.talk2scale` in `mobile-rn/`).

## Validate

1. **Mock mode** (no scale): open the app, long-press the weight, tap it to add weight, type a food, pick a hit. The log appears under Today's food. See [contracts/screens.md](contracts/screens.md).
2. **Scale**: power on the scale, tap the Bluetooth icon, pick `TalkToScale`, confirm live weight and Tare. Restart the app and confirm it reconnects. See [contracts/ble-scale.md](contracts/ble-scale.md).
3. **Voice**: hold the mic, say "200 grams of apple", release. The query fills and the first hit is logged after the countdown with 200 g.
4. **Recipe**: menu → Create Recipe, add two weighed ingredients, save.
5. **Parity**: walk [parity-checklist.md](parity-checklist.md). Every box must be checked before the old apps are removed.

## Measure the dev loop (SC-005, SC-006)

- UI change: edit a caption, use Live Edit or Apply Changes in Android Studio, time until it shows on the phone.
- Memory: watch peak memory of the Gradle and Kotlin daemons during `./gradlew clean :app:installDebug`, then of Metro plus Gradle during `cd mobile-rn && npx expo run:android`. Record both numbers in the parity checklist.
