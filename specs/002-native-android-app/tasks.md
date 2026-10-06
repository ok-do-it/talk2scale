---
description: "Task list for the native Android app"
---

# Tasks: Native Android App

**Input**: Design documents from `/specs/002-native-android-app/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md, parity-checklist.md

**Tests**: Not included. FR-020 and the spec clarification require no automated tests. Done-check is `cd android && ./gradlew :app:assembleDebug :app:lintDebug`, then the phone walk in [parity-checklist.md](parity-checklist.md).

**Organization**: Tasks are grouped by user story so each story can be implemented and checked on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US6)
- Captions are string literals in the composable that renders them (constitution Principle IV). Only the app name goes in `strings.xml`.

## Path Conventions

- New app: `android/app/src/main/java/dev/talk2scale/`
- `mobile/` is the reference for features, backend calls, and the scale protocol. Do not change it until User Story 6.
- `backend/` and `esp32/` stay unchanged (FR-015).

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the fresh Gradle app in `android/` (not a conversion of `android-legacy/`)

- [X] T001 Create the Gradle project under `android/`: `settings.gradle.kts`, root `build.gradle.kts`, `gradle/libs.versions.toml`, `gradle/wrapper/gradle-wrapper.properties` (Gradle 8.13), and `gradle.properties` with configuration cache and build cache on. Use Android Gradle Plugin 8.13 and Kotlin 2.x. Gradle must run on Android Studio's JDK 21 (`/Applications/Android Studio.app/Contents/jbr`), not the system JDK.
- [X] T002 Configure `android/app/build.gradle.kts`: `applicationId` `dev.talk2scale.android`, namespace `dev.talk2scale`, `minSdk` 34, `compileSdk` and `targetSdk` 36, JVM target 17, Jetpack Compose BOM with Material 3, Navigation Compose, Lifecycle ViewModel, Kotlin coroutines, Retrofit, OkHttp, kotlinx.serialization, and DataStore Preferences. Add `BuildConfig.API_BASE_URL` from Gradle property `talk2scale.apiBaseUrl` (settable in `android/local.properties` or `~/.gradle/gradle.properties`), default `http://10.0.2.2:8888`.
- [X] T003 [P] Declare `BLUETOOTH_SCAN` (with `neverForLocation`), `BLUETOOTH_CONNECT`, `RECORD_AUDIO`, and `INTERNET` in `android/app/src/main/AndroidManifest.xml`, and point the application at the network security config.
- [X] T004 [P] Add debug-only cleartext HTTP in `android/app/src/main/res/xml/network_security_config.xml`, and put only the app name in `android/app/src/main/res/values/strings.xml`.
- [X] T005 [P] Add a Material 3 theme with no user-facing copy in `android/app/src/main/java/dev/talk2scale/ui/theme/Theme.kt`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: App shell, preferences, and the backend client every story uses

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T006 [P] Implement DataStore preferences in `android/app/src/main/java/dev/talk2scale/data/Preferences.kt`. Key `scale_mac` is `String?` with default none; it is written after a successful connect and cleared by Forget All Devices. Key `user_id` is `Int` with default `1`; it is written when the user confirms a numeric ID, and an empty entry leaves it unchanged.
- [X] T007 [P] Define the shared scale interface in `android/app/src/main/java/dev/talk2scale/scale/ScaleTransport.kt` (scan, connect, disconnect, weight notifications, tare, calibrate) so BLE and mock mode implement the same contract (FR-007).
- [X] T008 [P] Implement all 11 calls in `android/app/src/main/java/dev/talk2scale/data/api/Talk2ScaleApi.kt` and DTOs in `android/app/src/main/java/dev/talk2scale/data/api/ApiModels.kt`: `GET /users/:userId`, `GET /users/:userId/food-logs?from&to`, `GET /users/:userId/food-logs/nutrients?from&to`, `GET /users/:userId/daily-targets`, `GET /elements?type=nutrient`, `GET /search-food?food_name=`, `POST /food-logs`, `PUT /food-logs/:id`, `DELETE /food-logs/:id`, `POST /recipes`, `POST /voice/transcribe`. Times `from`, `to`, and `logged_at` are ISO-8601 UTC strings; `from`/`to` cover the local day. Search hits are `{ foodNameId, elementId, elementName, name, distance }`. Do not port `fetchElementNutrients`, `fetchMeasures`, or `searchElements`. Map a non-2xx body `{ "error": "..." }` to that message, otherwise `HTTP <status>`. A network failure is a short "cannot reach server" message. Voice upload is a later story; declare the multipart method here with a 15 s call timeout.
- [X] T009 Wire `Talk2ScaleApp` and a hand-built `AppContainer` in `android/app/src/main/java/dev/talk2scale/Talk2ScaleApp.kt` that constructs preferences, the API client (base URL `BuildConfig.API_BASE_URL`), and later repositories. No Hilt.
- [X] T010 Host Compose in `android/app/src/main/java/dev/talk2scale/MainActivity.kt` with a `NavHost` for routes `home`, `connection`, and `createRecipe` (placeholder composables until their stories). `home` is the start destination.
- [X] T011 Run `cd android && ./gradlew :app:assembleDebug :app:lintDebug` and leave the skeleton building before any story starts.

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 - Connect to the scale and see live weight (Priority: P1) 🎯 MVP

**Goal**: Bluetooth connect, automatic reconnect, live weight, stable indicator, tare, calibration, disconnect, forget, and mock mode

**Independent Test**: Install this slice on an Android phone, connect to the scale, and confirm live weight, the stable indicator, tare, calibration, reconnect, and mock mode (parity checklist sections "Scale connection" and "Mock mode")

### Implementation for User Story 1

- [X] T012 [P] [US1] Implement `android/app/src/main/java/dev/talk2scale/scale/ScaleCodec.kt`. Weight notifications are 4-byte signed little-endian grams; payloads shorter than 4 bytes are ignored (no base64). Tare bytes are `01`. Calibrate bytes are `02 lo hi` (reference grams as `uint16` little-endian). Service `4c78c001-8118-4aea-8f72-70ddbda3c9b9`, notify `4c78c002-8118-4aea-8f72-70ddbda3c9b9`, write `4c78c003-8118-4aea-8f72-70ddbda3c9b9`.
- [X] T013 [P] [US1] Implement `android/app/src/main/java/dev/talk2scale/scale/MockScaleTransport.kt`. A mock weight tap adds `floor(random * 251) + 50` grams. Tare sets the local weight to 0. Calibrate is a no-op. Mock readings are always stable.
- [X] T014 [US1] Implement application-scoped `android/app/src/main/java/dev/talk2scale/scale/ScaleRepository.kt` with `StateFlow` and register it in `Talk2ScaleApp.kt`. `ConnectionState`: `Disconnected` → `Connecting` → `Connected`; any failure or link loss → `Disconnected`. `WeightReading.grams` is a signed `Int` from BLE or mock. `WeightReading.stable` is true when the last 3 values are equal (window 3); mock readings are always stable. `reading` is null until the first value. `lastGrams` is the last published value. `mockEnabled` starts true, turns false on real connect or when a real connection is requested, and turns true on disconnect or failed reconnect. `realConnectionRequested` is true from connect request until disconnect or cancel. `connection` tracks real BLE only. BLE readings are published only while `Connected`. Mock readings are published only while not connected and `mockEnabled`. Tare goes to BLE when connected, otherwise to the mock (local zero). Calibrate is sent only when connected. On start with a stored `scale_mac`, reconnect with `autoConnect`; on failure, fall back to mock mode. Depends on T012, T013.
- [X] T015 [P] [US1] Build `android/app/src/main/java/dev/talk2scale/ui/entry/WeightDisplay.kt` showing grams, a stable indicator, and a Tare button. Captions are literals in this file. In debug builds, a long-press on the weight toggles mock mode; in mock mode a tap on the weight adds a random weight.
- [X] T016 [US1] Implement `android/app/src/main/java/dev/talk2scale/scale/BleScaleTransport.kt` with `BluetoothLeScanner` and `BluetoothGatt`. A scan result is the scale when it advertises service `4c78c001-8118-4aea-8f72-70ddbda3c9b9` or the name `TalkToScale`; de-duplicate by address. Connection sequence: stop scanning; `connectGatt(autoConnect = true)` for a stored device and `false` for a device picked from the scan; discover services; enable notifications on the notify characteristic (set notification and write CCCD `0x2902` = `01 00`); report `Connected`. Serialize GATT operations on one coroutine. Write commands with response; ignore write failures. Link loss reports `Disconnected` and the last weight stops being live. Depends on T012.
- [X] T017 [P] [US1] Implement `android/app/src/main/java/dev/talk2scale/ui/connection/ConnectionScreen.kt` and `ConnectionViewModel.kt`. Request `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT` at runtime. When opened with a connect request, reconnect to the stored device if there is one, otherwise scan and list discovered scales. Buttons: Connect, Disconnect, Forget All Devices (clears `scale_mac` so the next start does not reconnect). If Bluetooth is off, say so and offer to connect once it is on. If permission is denied, explain that the scale cannot connect and leave mock mode available. Depends on T014, T016.
- [X] T018 [P] [US1] Implement `android/app/src/main/java/dev/talk2scale/ui/calibration/CalibrationDialog.kt`. "Set Zero" sends Tare. "Set Calibration Weight" takes reference grams and sends Calibrate. When disconnected, show "Scale not connected" and do not send Calibrate. Captions are literals in this file. Depends on T014.
- [X] T019 [US1] Add the Home shell in `android/app/src/main/java/dev/talk2scale/ui/home/HomeScreen.kt` and `HomeViewModel.kt`: show `WeightDisplay`, open Connection from the Bluetooth icon (starting a connect attempt when not connected), and open Calibration from the Settings icon or show "Scale not connected". Call `ScaleRepository` start so a stored scale reconnects. Depends on T014, T015, T017, T018.

**Checkpoint**: User Story 1 works on a phone with the scale and in mock mode, with no food logging yet

---

## Phase 4: User Story 2 - Log food from the scale by voice or search (Priority: P1)

**Goal**: Typed search and voice transcription log a food at the current weight; today's log supports edit and confirmed delete

**Independent Test**: With the scale connected or mock mode on, log foods by voice and by typed search, edit one, delete another, and confirm the dashboard list matches the backend (parity checklist section "Food entry" and the food-log rows of "Dashboard")

### Implementation for User Story 2

- [X] T020 [US2] Implement search and food-log methods in `android/app/src/main/java/dev/talk2scale/data/FoodRepository.kt` and register it in `Talk2ScaleApp.kt`. `GET /search-food` returns at most 6 hits. `POST /food-logs` sends `measure_id` `1` (grams) and `amount` in grams, plus `user_id`, `element_id`, `raw_name`, and `logged_at`. `PUT /food-logs/:id` updates `element_id` and `raw_name` only. `DELETE /food-logs/:id` deletes a log. `GET /users/:userId/food-logs?from&to` uses local midnight through 23:59:59.999 as ISO-8601 UTC. Surface the API error message and keep the caller's entered text on failure.
- [X] T021 [P] [US2] Implement `android/app/src/main/java/dev/talk2scale/ui/home/FoodLogList.kt`. `FoodLogRow` shows `id`, `name` (from `raw_name`), `loggedAt`, and `kcal` (rounded, 0 if missing). Rows are sorted newest first. A new cluster header (showing the first row's time) starts when the gap to the previous row is more than 30 minutes. Swipe right asks to delete, then the caller refreshes. Captions are literals in this file.
- [X] T022 [US2] Implement typed search and logging in `android/app/src/main/java/dev/talk2scale/ui/entry/FoodEntryViewModel.kt` and `FoodEntryPanel.kt`. `query` is typed text. `results` is up to 6 hits from `/search-food`, fetched 300 ms after typing stops, showing `name` and type (`whole_food`, matching `mobile/src/services/nutritionApi.ts`). Show "Searching..." while loading. Search field caption is "Food name" with a clear button that empties the query. `ResolvedFood` is `rawName`, `elementId`, `amountGrams`. `amountGrams` is `spokenGrams` if set, else `lastGrams`, and must be greater than 0 when creating a new log (zero or negative shows no log is created). Picking a food with no weight shows "No weight reading yet" and does not create a log. After a new log is created, the app sends Tare. Edit mode: picking a food updates `element_id` and `raw_name` only. On backend error, show the message and keep what the user entered. Captions are literals in `FoodEntryPanel.kt`. Depends on T020.
- [X] T023 [P] [US2] Implement `android/app/src/main/java/dev/talk2scale/voice/VoiceRecorder.kt` with `MediaRecorder`: `AudioSource.VOICE_RECOGNITION`, `OutputFormat.MPEG_4`, `AudioEncoder.AAC`, 44.1 kHz, mono, 128 kbps, cache file `recording.m4a`. Hold the mic to record, release to stop, auto-stop at 10 seconds. If the app goes to the background, stop and discard the clip and upload nothing. If microphone permission is denied, do not record.
- [X] T024 [US2] Implement `android/app/src/main/java/dev/talk2scale/voice/VoiceRepository.kt`. Upload `multipart/form-data` with one part `audio`, filename `recording.m4a`, content type `audio/mp4`, to `POST /voice/transcribe`, client timeout 15 s. Response is `{ text, grams? }`. On a non-2xx status, if the body still has non-empty `text`, use it; otherwise show `error`. Depends on T008, T023.
- [X] T025 [US2] Add voice to `android/app/src/main/java/dev/talk2scale/ui/entry/FoodEntryViewModel.kt` and `android/app/src/main/java/dev/talk2scale/ui/entry/FoodEntryPanel.kt`. `listening` is true while the mic button is held. Button captions are "Hold to speak" and "Release to send"; show "Listening..." over the field. Transcribed text fills `query` and searches immediately. `spokenGrams` is grams from the transcription and overrides the scale weight when set. `autoSelect`: after a voice search, the first hit is picked after a 3 s countdown unless the user changes the query. Empty or failed transcription shows "Food not found. Please hold the mic and repeat." Denied microphone permission explains that permission is required, and typed search still works. Depends on T022, T024.
- [X] T026 [US2] Put the food entry panel and `FoodLogList` on the Scale page in `android/app/src/main/java/dev/talk2scale/ui/home/HomeScreen.kt` and `android/app/src/main/java/dev/talk2scale/ui/home/HomeViewModel.kt`. Tap a row to enter edit mode (Scale page opens with that row's name as the query). Back leaves edit mode. Confirm before delete, then refresh. Refresh today's logs on open, on return from another screen, and after each create, edit, or delete. Depends on T021, T022, T025.

**Checkpoint**: Foods can be logged, edited, and deleted by search and by voice; nutrition totals are not required yet

---

## Phase 5: User Story 3 - See today's nutrition against targets (Priority: P2)

**Goal**: Two-page carousel with today's totals against daily targets, and the Scale page from User Story 2

**Independent Test**: With known food logs for today, open the Nutrition page and compare totals and targets with the React Native app for the same user

### Implementation for User Story 3

- [X] T027 [US3] Add nutrition reads to `android/app/src/main/java/dev/talk2scale/data/FoodRepository.kt`: `GET /users/:userId/food-logs/nutrients?from&to`, `GET /users/:userId/daily-targets` (may be `null`), and `GET /elements?type=nutrient` only when targets list nutrients. `from`/`to` cover the local day as ISO-8601 UTC. On load failure, keep the last good totals and return an error line.
- [X] T028 [P] [US3] Implement `android/app/src/main/java/dev/talk2scale/ui/home/NutritionSummary.kt`. Each `SummaryRow` is nutrient name, today's amount, and target amount (if any). Caption "Today" is a literal in this file. On load failure, the last good totals stay on screen with an error line.
- [X] T029 [US3] Add a two-page `HorizontalPager` to `android/app/src/main/java/dev/talk2scale/ui/home/HomeScreen.kt`: page 1 Nutrition (`NutritionSummary`), page 2 Scale (live weight and the food entry panel). Page dots switch pages. Footer is "Add Food From Scale" on the Nutrition page and "Back" on the Scale page (Back also leaves edit mode). Refresh nutrition when that page is shown, and after a new log so totals include it. Depends on T027, T028.

**Checkpoint**: Nutrition and Scale pages both work, and a new log shows up in the totals

---

## Phase 6: User Story 4 - Create a recipe from weighed ingredients (Priority: P2)

**Goal**: Create Recipe screen reuses the food entry panel and saves the recipe in one request

**Independent Test**: Create a recipe with three weighed ingredients, save it, and confirm the backend has the name, ingredients, and weights

### Implementation for User Story 4

- [X] T030 [US4] Add `POST /recipes` to `android/app/src/main/java/dev/talk2scale/data/FoodRepository.kt`. Body is `name`, optional `serving_grams`, `user_id`, and `children = [{ element_id, grams }]`. Show the backend `{ "error": "..." }` message on failure.
- [X] T031 [US4] Implement `android/app/src/main/java/dev/talk2scale/ui/recipe/CreateRecipeViewModel.kt` and `CreateRecipeScreen.kt`. Draft `name` is required, trimmed. `servingGrams` is an optional string; if set, it must parse to a number > 0. `ingredients` is a list of `elementId`, `name`, `grams` and needs at least one. Reuse `FoodEntryPanel` to weigh and resolve ingredients. Show each ingredient with grams and a delete button, plus total grams. Save sends one request. If there is no recipe name, ask for a recipe name first ("Enter a recipe name first"). If there are no ingredients, ask to add at least one ("Add at least one ingredient"). If serving size is not a positive number, reject it ("Serving grams must be a positive number"). Leaving with ingredients asks to discard ("Discard recipe?" / "Your unsaved ingredients will be lost."). Captions are literals in `CreateRecipeScreen.kt`. Depends on T025, T030.
- [X] T032 [US4] Open `createRecipe` from the Home menu ("Create Recipe") in `android/app/src/main/java/dev/talk2scale/ui/home/HomeScreen.kt`. Depends on T031.

**Checkpoint**: A recipe can be drafted, validated, discarded, and saved without breaking single-food logging

---

## Phase 7: User Story 5 - Switch the active user (Priority: P3)

**Goal**: Set the active user ID, remember it, and reload that user's logs, targets, and nutrition

**Independent Test**: Switch to another user ID, restart the app, and confirm it still shows that user's data

### Implementation for User Story 5

- [X] T033 [US5] Add the user control to `android/app/src/main/java/dev/talk2scale/ui/home/HomeScreen.kt` and `android/app/src/main/java/dev/talk2scale/ui/home/HomeViewModel.kt`. The user icon opens a User ID dialog (number input, Cancel, OK). The label next to it shows the user name from `GET /users/:userId`, or `#<id>` if unknown. Captions are literals in `HomeScreen.kt`.
- [X] T034 [US5] On OK, write `user_id` through `android/app/src/main/java/dev/talk2scale/data/Preferences.kt` only when the user confirms a numeric ID; an empty entry leaves it unchanged. From `android/app/src/main/java/dev/talk2scale/ui/home/HomeViewModel.kt`, reload food logs, nutrition totals, and daily targets for that id. On the next process start, read `user_id` (default `1`) and load that user. Depends on T033, T026, T029.

**Checkpoint**: The chosen user survives restart and the dashboard shows that user's data

---

## Phase 8: User Story 6 - Retire the old mobile apps (Priority: P3)

**Goal**: After every parity item passes, remove `mobile/` and `android-legacy/` and point the docs at `android/`

**Independent Test**: A new contributor following the docs can build and run the native app and does not find instructions for the removed apps

### Implementation for User Story 6

- [ ] T035 [US6] On the phone, walk every item in `specs/002-native-android-app/parity-checklist.md`, including SC-003 (live weight within 5 seconds of opening with a stored scale), SC-004 (10 reference weights match the scale), SC-005 (a small UI change reaches the phone in under 30 seconds), and SC-006 (peak memory of `./gradlew clean :app:installDebug` versus `cd mobile && npx expo run:android`). Record intended differences in that file. Do not start T036 until every box passes. `mobile/` must stay in the repo and working until then (FR-017).
- [ ] T036 [US6] Remove `mobile/` and `android-legacy/` from the repository. Depends on T035.
- [ ] T037 [P] [US6] Update `README.md` and `AGENTS.md` so the mobile client is the native Android app in `android/`, including build and run steps from `specs/002-native-android-app/quickstart.md`. Depends on T036.
- [ ] T038 [P] [US6] Update `docs/mobile-app/` so BLE, permissions, and the app layout describe the Kotlin app (`BluetoothGatt`, `MediaRecorder`, `dev.talk2scale.android`) instead of React Native. Depends on T036.
- [ ] T039 [US6] Amend `.specify/memory/constitution.md` to drop `mobile/` as a reference (Principles I and II, Technology Constraints, Development Workflow). This is a MAJOR version bump. Keep hard-coded captions, the backend verification gate, user-owned foods, and "do not commit unless the user asks." Depends on T036.

**Checkpoint**: The repository has one mobile app, and the docs and constitution describe it

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Prove the done-check and that removal did not leave stale instructions

- [ ] T040 Run `cd android && ./gradlew :app:assembleDebug :app:lintDebug` from the repository root and leave `android/` building clean.
- [ ] T041 [P] Walk `specs/002-native-android-app/quickstart.md` against the `android/` project (JDK 21, `talk2scale.apiBaseUrl`, install id `dev.talk2scale.android`) and fix any command or path that drifted.
- [ ] T042 [P] Check `README.md`, `AGENTS.md`, `docs/mobile-app/`, and `.specify/memory/constitution.md` for build or architecture instructions that still point at `mobile/` or `android-legacy/` (SC-007).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — blocks all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational — no dependency on other stories
- **User Story 2 (Phase 4)**: Depends on User Story 1 (weight, tare, mock mode)
- **User Story 3 (Phase 5)**: Depends on User Story 2 (`HomeScreen.kt` Scale page and food logs)
- **User Story 4 (Phase 6)**: Depends on User Story 2 (shared `FoodEntryPanel`). Sequence it after User Story 3 because both edit `HomeScreen.kt`
- **User Story 5 (Phase 7)**: Depends on User Stories 2 and 3 so a user switch reloads logs and nutrition. Edits `HomeScreen.kt` after User Story 4
- **User Story 6 (Phase 8)**: Depends on Stories 1–5 and a completed parity walk
- **Polish (Phase 9)**: Depends on User Story 6

### User Story Dependencies

- **User Story 1 (P1)**: Starts after Foundational. MVP.
- **User Story 2 (P1)**: Starts after User Story 1. Independently testable with mock mode.
- **User Story 3 (P2)**: Starts after User Story 2. Nutrition UI is new; log data can already exist on the backend.
- **User Story 4 (P2)**: Starts after User Story 2's food entry panel. Does not require the nutrition page to function, but shares `HomeScreen.kt` and `FoodRepository.kt` with User Story 3, so implement it after User Story 3.
- **User Story 5 (P3)**: Starts after the dashboard loads user-scoped data (User Stories 2 and 3).
- **User Story 6 (P3)**: Starts only after the parity checklist passes.

### Within Each User Story

- Models and codecs before the repository that uses them
- Repository before the screen that calls it
- Story checkpoint before the next story that edits the same file (`HomeScreen.kt`, `FoodRepository.kt`)

### Parallel Opportunities

- T003, T004, and T005 after T002
- T006, T007, and T008 together
- T012 and T013 together; T015 alongside them
- T017 and T018 together after T014 and T016
- T021 and T023 alongside T020
- T028 alongside T027
- T037 and T038 together after T036
- T041 and T042 together after T040

---

## Parallel Example: User Story 1

```bash
# Codecs and the mock transport touch different files:
Task: "T012 ScaleCodec.kt"
Task: "T013 MockScaleTransport.kt"

# After the repository and BLE transport exist:
Task: "T017 ConnectionScreen.kt and ConnectionViewModel.kt"
Task: "T018 CalibrationDialog.kt"
```

---

## Parallel Example: User Story 2

```bash
# Presentational list and the recorder do not depend on each other:
Task: "T021 FoodLogList.kt"
Task: "T023 VoiceRecorder.kt"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Scale connection and mock mode on the phone
5. Demo live weight before any food-logging work

### Incremental Delivery

1. Setup + Foundational → app installs as `dev.talk2scale.android` next to the React Native app
2. User Story 1 → weight, tare, calibration, mock mode
3. User Story 2 → search, voice, log, edit, delete
4. User Story 3 → nutrition carousel
5. User Story 4 → Create Recipe
6. User Story 5 → user switch
7. Parity walk → only then User Story 6 (remove `mobile/` and `android-legacy/`)
8. Polish → Gradle done-check and a doc scan

### Parallel Team Strategy

After Foundational:

- One developer owns `HomeScreen.kt` and `FoodRepository.kt` and takes the stories in order (US1 → US2 → US3 → US4 → US5)
- During User Story 1, another developer can take `BleScaleTransport.kt` (T016) while the repository is in progress only after T012 is done
- During User Story 2, another developer can take `VoiceRecorder.kt` (T023) and `FoodLogList.kt` (T021)

Do not split stories that edit the same file across people at the same time.

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [US1]–[US6] map to spec.md user stories
- Do not add automated tests for this feature (FR-020)
- Do not change `backend/` or the scale protocol
- Do not commit unless the user asks (constitution Development Workflow)
- Leave `mobile/` in place and working until T035 passes

---

## Phase 10: Convergence

- [X] T043 On scale link loss, show disconnected on the Scale page, stop treating the last scale weight as live, and reconnect when the scale returns with GATT writes still working. User Disconnect still returns to mock mode. Today `ScaleRepository` enables mock and publishes a mock weight on every `Disconnected`, `ConnectionViewModel` keeps the previous status (so the screen can stay on "Connected"), and `BleScaleTransport` drops its `gatt` reference so a later reconnect cannot tare or calibrate. per spec edge: scale disconnects (contradicts)
- [X] T044 Do not treat coroutine cancellation as a backend failure in `FoodRepository.apiCall`, `HomeViewModel` log and nutrition loads, and `FoodEntryViewModel` search. A superseded request must not set an error line or clear a newer search result. per US3/AC2 (partial)
- [X] T045 When food search fails, show the backend or network message and keep the typed query in `FoodEntryPanel`. per spec edge: backend unreachable (partial)
- [X] T046 Ask to discard a Create Recipe draft on system back when there are unsaved ingredients, same as the Back button in `CreateRecipeScreen`. per US4/AC5 (partial)
