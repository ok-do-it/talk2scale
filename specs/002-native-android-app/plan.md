# Implementation Plan: Native Android App

**Branch**: `002-native-android-app` | **Date**: 2026-09-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-native-android-app/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Build a new native Android app in `android/` with Kotlin and Jetpack Compose that has every feature of the legacy React Native app in `mobile-rn/`: scale connection over Bluetooth, live weight, tare and calibration, mock mode, voice and typed food search, food logging with edit and delete, the Nutrition and Scale carousel, Create Recipe, and user switching. It uses the existing backend and scale protocol unchanged. The app talks to Android's own Bluetooth and audio APIs, keeps shared scale state in one repository with `StateFlow`, and installs next to the legacy React Native app under its own ID. Parity is checked by hand on the phone. After parity, `mobile-rn/` and `android-legacy/` are removed and the docs and constitution are updated.

## Technical Context

**Language/Version**: Kotlin 2.x, JVM target 17; Gradle run on Android Studio's JDK 21

**Primary Dependencies**: Jetpack Compose (BOM) with Material 3, Navigation Compose, Lifecycle ViewModel with `StateFlow`, Kotlin coroutines, Retrofit + OkHttp + kotlinx.serialization, DataStore Preferences. Platform `BluetoothGatt` and `MediaRecorder`.

**Storage**: DataStore keys `scale_mac` and `user_id` on the phone. All food data stays in the backend's Postgres.

**Testing**: No automated tests (spec clarification, FR-020). Done-check is `cd android && ./gradlew :app:assembleDebug :app:lintDebug`, then [parity-checklist.md](parity-checklist.md) on the phone.

**Target Platform**: Android 14+ (API 34), compile and target SDK 36, the developer's phone

**Project Type**: Mobile app (client of the existing Node API)

**Performance Goals**: Live weight within 5 s of opening with a stored scale (SC-003). Weight updates about three times a second without dropped frames. UI change on the phone in under 30 s (SC-005).

**Constraints**: No backend, firmware, or protocol changes (FR-015). Captions are literals in the composable that renders them. `mobile-rn/` stays in the repository and keeps working until parity (FR-017). Fresh project, not a conversion of `android-legacy/` (FR-019).

**Scale/Scope**: 3 screens and 1 dialog, 11 backend calls, 1 Bluetooth service. The React Native source is about 3,400 lines.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Checked against constitution 2.0.0.

| Principle | Gate | Result |
|-----------|------|--------|
| I. Food-Logging Product | Native Android client, Node backend, Postgres, BLE scale | Pass. Same product, native client. |
| II. Existing Module Boundaries | Mobile work in `android/`; `mobile-rn/` is a legacy reference only, stays working, binding for features, backend calls, and protocol | Pass. All new code in `android/`. `mobile-rn/` is read, not changed. Contracts list the binding calls and protocol. |
| III. Backend Verification Gate | Backend changes pass typecheck and check | Pass. No backend changes planned. If one turns out to be needed, it is a separate change that must pass the gate. |
| IV. Hard-Coded Mobile Captions | Captions are literals in the UI file that renders them | Pass. No `strings.xml` for UI copy; only the app name lives there, as Android requires. |
| V. User-Owned Foods | User foods stay out of the USDA catalog | Pass. Not touched by this feature. |
| Workflow: no commits unless asked | — | Pass. |

**Post-design re-check**: Pass. The design adds only `android/`, calls only the documented endpoints in [contracts/backend-api.md](contracts/backend-api.md), and uses the unchanged protocol in [contracts/ble-scale.md](contracts/ble-scale.md). No exceptions.

## Project Structure

### Documentation (this feature)

```text
specs/002-native-android-app/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── parity-checklist.md       # hand-walked acceptance test (FR-020)
├── contracts/
│   ├── backend-api.md
│   ├── ble-scale.md
│   └── screens.md
├── checklists/requirements.md
└── tasks.md                  # /speckit-tasks, not this command
```

### Source Code (repository root)

```text
android/
├── settings.gradle.kts
├── build.gradle.kts
├── gradle.properties                 # configuration cache, build cache
├── gradle/libs.versions.toml
└── app/
    ├── build.gradle.kts              # applicationId dev.talk2scale.android, API_BASE_URL
    └── src/main/
        ├── AndroidManifest.xml       # BLUETOOTH_SCAN/CONNECT, RECORD_AUDIO, INTERNET
        ├── res/xml/network_security_config.xml   # debug cleartext
        └── java/dev/talk2scale/
            ├── Talk2ScaleApp.kt      # Application, AppContainer
            ├── MainActivity.kt       # Compose host, NavHost
            ├── data/
            │   ├── api/Talk2ScaleApi.kt      # Retrofit interface, all 11 calls
            │   ├── api/ApiModels.kt          # serializable DTOs
            │   ├── Preferences.kt            # DataStore: scale_mac, user_id
            │   └── FoodRepository.kt         # logs, nutrients, targets, search, recipes
            ├── scale/
            │   ├── ScaleTransport.kt         # interface
            │   ├── BleScaleTransport.kt      # scan, GATT, notify, write
            │   ├── MockScaleTransport.kt
            │   ├── ScaleCodec.kt             # int32 LE decode, tare/calibrate bytes
            │   └── ScaleRepository.kt        # StateFlow state, stability, mock rules
            ├── voice/
            │   ├── VoiceRecorder.kt          # MediaRecorder, 10 s limit
            │   └── VoiceRepository.kt        # upload, transcription result
            └── ui/
                ├── theme/
                ├── home/HomeScreen.kt, HomeViewModel.kt, NutritionSummary.kt, FoodLogList.kt
                ├── entry/FoodEntryPanel.kt, FoodEntryViewModel.kt, WeightDisplay.kt
                ├── calibration/CalibrationDialog.kt
                ├── connection/ConnectionScreen.kt, ConnectionViewModel.kt
                └── recipe/CreateRecipeScreen.kt, CreateRecipeViewModel.kt
```

Removed after parity (FR-018): `mobile-rn/`, `android-legacy/`. Updated after parity: `README.md`, `AGENTS.md`, `docs/mobile-app/`, constitution (drop `mobile-rn/` as reference).

**Structure Decision**: One Gradle app module in `android/`, split by package rather than by Gradle module, because the app is small and one module builds fastest. Packages follow the React Native layout: `scale/` for `transport/` and `state/scaleStore.ts`, `data/` for `services/`, `ui/` for `screens/` and `components/`. `backend/` and `esp32/` are unchanged.

**Build order** (for `/speckit-tasks`): project skeleton and theme → scale codec, mock transport, scale repository, weight display (mock mode works) → BLE transport and Connection screen → API client and Home dashboard → food entry with typed search and logging → voice recording → Create Recipe → user switching → parity walk → removal and doc updates.

## Complexity Tracking

No constitution violations.
