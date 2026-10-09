# Research: Native Android App

All Technical Context unknowns are resolved below. The legacy React Native app in `mobile-rn/` is binding for features, backend calls, and the scale protocol (constitution Principle II, spec FR-001a).

## R1. Language and UI toolkit

- **Decision**: Kotlin 2.x with Jetpack Compose and Material 3, single activity.
- **Rationale**: Requested by the user. Compose is the current Android UI toolkit, and AI assistants generate it well. One activity with Compose navigation matches the three React Native screens.
- **Alternatives considered**: Views with XML and Fragments, as in `android-legacy/`. Rejected: that is the style being replaced (FR-019).

## R2. Build toolchain

- **Decision**: Android Gradle Plugin 8.13 (same as `android-legacy/`), Gradle Kotlin DSL with a version catalog, `compileSdk`/`targetSdk` 36, `minSdk` 34. Run Gradle on the JDK 21 that ships with Android Studio (`/Applications/Android Studio.app/Contents/jbr`), not the system JDK 25.
- **Rationale**: SDK platform 36 and build tools are already installed. AGP 8.13 is known to work here. System Java 25 is newer than what this Gradle line supports reliably, so pinning Studio's JBR avoids a confusing first build failure.
- **Alternatives considered**: AGP 9 / Gradle 9. Deferred: no need for this feature, and upgrading can be done later on its own.

## R3. Application ID

- **Decision**: `applicationId = "dev.talk2scale.android"`, Kotlin package `dev.talk2scale`.
- **Rationale**: The React Native app is installed as `dev.talk2scale`. A different ID lets both apps sit on the phone during the port, which parity checking by hand (FR-020) needs.
- **Alternatives considered**: Reuse `dev.talk2scale`. Rejected: installing one would replace the other.

## R4. State and architecture

- **Decision**: One `ScaleRepository` (application-scoped) that owns the transports and exposes `StateFlow`s for connection state, weight reading, and mock mode. Screen state lives in a `ViewModel` per screen with `StateFlow`. Dependencies are wired by hand in an `AppContainer` on the `Application` class.
- **Rationale**: Mirrors `mobile-rn/src/state/scaleStore.ts` (one shared scale store, screens read from it). Manual wiring keeps the build small and readable; there are about ten classes to wire.
- **Alternatives considered**: Hilt. Rejected for now: annotation processing adds build time and indirection, which is what the switch is trying to remove.

## R5. Bluetooth

- **Decision**: Platform `BluetoothLeScanner` and `BluetoothGatt`, wrapped in a `BleScaleTransport` class that exposes Kotlin flows. Match a device by service UUID or by name `TalkToScale`. Connect with `autoConnect` on reconnect, discover services, enable notifications on the notify characteristic (write the CCCD descriptor), and write commands with response. Serialize GATT operations on one coroutine.
- **Rationale**: One service with one notify and one write characteristic is small enough for the platform API. `android-legacy/BleScaleTransport.java` already shows the platform calls. `minSdk 34` allows the newer `writeCharacteristic`/`writeDescriptor` overloads that take the value directly. Errors are Android's own, which is the debugging win the user wants.
- **Alternatives considered**: Nordic Kotlin BLE library. Kept as a fallback if GATT callback handling becomes a problem; not needed for one characteristic pair.

## R6. Voice recording

- **Decision**: `MediaRecorder` with `AudioSource.VOICE_RECOGNITION`, `OutputFormat.MPEG_4`, `AudioEncoder.AAC`, 44.1 kHz, mono, 128 kbps, written to a cache file `recording.m4a`. Hold the mic button to record, release to stop and upload, auto-stop after 10 s. Stop and discard when the app goes to the background.
- **Rationale**: Same format the React Native app sends and the backend expects (`audio/mp4`, field `audio`). `VOICE_RECOGNITION` is what `voiceRecording.ts` switched to for reliability. `MediaRecorder` writes the file directly, so no encoding code is needed.
- **Alternatives considered**: `AudioRecord` with raw PCM. Rejected: needs an encoder or a format change on the backend. On-device `SpeechRecognizer` (as in `android-legacy/SpeechRecognition.java`). Rejected: the backend also returns spoken grams, which the app uses.

## R7. HTTP client

- **Decision**: Retrofit with OkHttp and the kotlinx.serialization converter. Multipart upload for `/voice/transcribe` with a 15 s call timeout. Errors map the backend `{ "error": "..." }` body to the message shown to the user, as `readJsonOrThrow` does.
- **Rationale**: Common, well-documented stack; one interface file lists every endpoint the app uses, which doubles as the backend parity list.
- **Alternatives considered**: Ktor client. Equally viable; Retrofit chosen for the single interface listing all calls.

## R8. Backend base URL

- **Decision**: A `BuildConfig.API_BASE_URL` field read from the Gradle property `talk2scale.apiBaseUrl` (settable in `android/local.properties` or `~/.gradle/gradle.properties`), default `http://10.0.2.2:8888`. A debug-only network security config allows cleartext HTTP.
- **Rationale**: Same default and same override idea as `EXPO_PUBLIC_API_BASE_URL` in `mobile-rn/src/config/api.ts`. The React Native app already enables cleartext traffic.
- **Alternatives considered**: An in-app setting screen. Deferred: not in the React Native app.

## R9. Local storage

- **Decision**: Jetpack DataStore (Preferences) with keys `scale_mac` and `user_id`; default user ID `1`.
- **Rationale**: Replaces AsyncStorage in `mobile-rn/src/services/storage.ts` with the same keys and default.
- **Alternatives considered**: `SharedPreferences`. Works, but DataStore is the current recommendation and fits flows.

## R10. Dashboard carousel and lists

- **Decision**: Compose `HorizontalPager` with two pages (Nutrition, Scale). `LazyColumn` for today's food log with 30-minute cluster headers.
- **Rationale**: Direct equivalents of the React Native `ScrollView` carousel and `FoodLogList`.

## R11. Testing and done-check

- **Decision**: No automated tests (spec clarification, FR-020). The done-check for Android work is `cd android && ./gradlew :app:assembleDebug :app:lintDebug` succeeding, then walking [parity-checklist.md](parity-checklist.md) on the phone.
- **Rationale**: The build and lint are the cheapest proof the code is consistent, similar to the backend gate. The parity walk is the acceptance test.

## R12. Development loop

- **Decision**: Use Compose Previews for layout and Android Studio Live Edit or Apply Changes for small UI edits on the phone. Configuration cache and build cache on in `gradle.properties`.
- **Rationale**: Targets SC-005 (UI change on the phone in under 30 s) and SC-006 (lower memory than Metro + Gradle).
- **How to measure SC-006**: Peak resident memory of the build processes during a clean debug build and install, using Activity Monitor or `/usr/bin/time -l`, for `mobile-rn` (`npx expo run:android`) and for `android` (`./gradlew :app:installDebug`).
