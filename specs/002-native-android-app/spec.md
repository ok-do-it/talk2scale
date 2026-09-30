# Feature Specification: Native Android App

**Feature Branch**: `002-native-android-app`

**Created**: 2026-09-29

**Status**: Draft

**Input**: User description: "Switch the mobile app from React Native to a modern native Android app (Kotlin, Jetpack Compose). The app is Android-only, iOS is unlikely and can be ported back later if needed. React Native adds indirection and debugging pain (microphone recorder), and uses more memory and CPU during build and dev deploy. Start a fresh project rather than converting the old Java-based `android-legacy` app; reuse it only as a reference for native BLE handling. Keep the React Native app until the native app reaches feature parity."

## Clarifications

### Session 2026-09-29

- Q: Where does the native app live? → A: A new module at `./android` in the repository root.
- Q: What defines the expected behavior of the native app? → A: The React Native app code in `mobile/` is the spec. This document summarizes it; where they differ, the React Native code wins (narrowed by the next answer).
- Q: When the React Native code has a bug or awkward behavior, should the native app copy it or fix it? → A: Treat the React Native app as a guide only; improve the design freely where it helps.
- Q: How much automated testing should the native app include before parity counts as done? → A: None; every feature is checked by hand on the phone against the parity checklist.
- Q: When should the project constitution be updated to name the native Android app instead of React Native? → A: Now, before `/speckit-plan`: `android/` becomes the mobile module, and `mobile/` stays only as the reference until parity.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect to the scale and see live weight (Priority: P1)

The user opens the native app, grants Bluetooth permission, and connects to the scale. If a scale was used before, the app reconnects to it automatically. Otherwise the user scans, picks the scale from the discovered devices, and the app remembers it. Once connected, the live weight updates about three times per second and shows when the reading is stable. The user can tare the scale, calibrate it with a reference weight, disconnect, and forget stored devices. Without a scale, the user can turn on mock mode to get simulated weights for development.

**Why this priority**: Weight capture is the core of the product and the riskiest part to rebuild. Every other flow depends on a working weight reading.

**Independent Test**: Install only this slice on an Android phone, connect to the scale, and confirm the live weight, stable indicator, tare, calibration, reconnect, and mock mode are all available and working, as they are in the current app.

**Acceptance Scenarios**:

1. **Given** the app has never connected to a scale, **When** the user grants Bluetooth permission and selects the scale from the scan results, **Then** the app connects, shows live weight, and remembers the scale.
2. **Given** a remembered scale is powered on, **When** the user opens the app, **Then** the app reconnects without the user scanning again.
3. **Given** the scale is connected with an item on it, **When** the user taps Tare, **Then** the displayed weight returns to zero.
4. **Given** the calibration dialog is open, **When** the user sets zero, places a reference weight, and confirms it, **Then** the scale is calibrated and later readings match the reference weight.
5. **Given** the same weight repeats across the stability window, **When** the reading settles, **Then** the app marks it as stable.
6. **Given** no scale is connected, **When** the user enables mock mode, **Then** the app shows simulated weights and tare works locally.
7. **Given** the user chooses Forget All Devices, **When** they reopen the app, **Then** it does not try to reconnect and asks them to scan.

---

### User Story 2 - Log food from the scale by voice or search (Priority: P1)

With food on the scale, the user taps the microphone and says the food name, or types to search. The app shows matching foods from the backend. The user picks one, and the app logs it with the current weight. Today's food log appears on the dashboard, grouped when entries are within 30 minutes of each other. The user can edit or delete a logged item after confirming.

**Why this priority**: Logging food is the product's purpose. Voice recording is the reliability problem that motivates the switch, so it has to work well in the native app.

**Independent Test**: With the scale connected (or mock mode on), log several foods by voice and by typed search, then edit one and delete another, and confirm the dashboard list matches the backend.

**Acceptance Scenarios**:

1. **Given** microphone permission is granted, **When** the user taps the mic and speaks a food name, **Then** the app records for up to 10 seconds, shows a Listening state, and fills the search with the transcribed text.
2. **Given** a food name is entered, **When** matching foods load, **Then** the user can pick one and it is logged with the current weight.
3. **Given** no weight reading is available, **When** the user tries to log food, **Then** the app tells them there is no weight reading yet and does not create a log.
4. **Given** today has logs, **When** the dashboard loads, **Then** it lists them with name and time, grouped when they are within 30 minutes of each other.
5. **Given** a logged item, **When** the user deletes it and confirms, **Then** it disappears from the list and from the backend.
6. **Given** the user denies microphone permission, **When** they tap the mic, **Then** the app explains that permission is required and typed search still works.

---

### User Story 3 - See today's nutrition against targets (Priority: P2)

The dashboard has a two-page carousel: a Nutrition page with today's totals against the user's daily targets, and a Scale page with the live weight and logging controls. The user swipes between them.

**Why this priority**: Nutrition totals are the main reason to log food, but they are read-only and rely on the logging flow from User Story 2.

**Independent Test**: With known food logs for today, open the Nutrition page and compare its totals and targets with the current app for the same user.

**Acceptance Scenarios**:

1. **Given** the user has logs today and daily targets, **When** they open the Nutrition page, **Then** it shows today's totals next to each target, matching the current app.
2. **Given** the user logs a new food, **When** they return to the Nutrition page, **Then** the totals include the new food.

---

### User Story 4 - Create a recipe from weighed ingredients (Priority: P2)

From the menu, the user opens Create Recipe, enters a recipe name and an optional serving size in grams, then weighs and resolves each ingredient with the same voice or search entry as the dashboard. They can remove ingredients and save the recipe in one step. Leaving with unsaved ingredients asks for confirmation.

**Why this priority**: Recipes are an existing feature the switch must keep, but they are used less often than single-food logging.

**Independent Test**: Create a recipe with three weighed ingredients, save it, and confirm the backend has it with the right ingredients and weights.

**Acceptance Scenarios**:

1. **Given** a name and at least one ingredient, **When** the user saves, **Then** the recipe and all its ingredients are saved together.
2. **Given** no recipe name, **When** the user saves, **Then** the app asks for a recipe name first.
3. **Given** no ingredients, **When** the user saves, **Then** the app asks them to add at least one ingredient.
4. **Given** a serving size that is not a positive number, **When** the user saves, **Then** the app rejects it with a message.
5. **Given** unsaved ingredients, **When** the user goes back, **Then** the app asks whether to discard the recipe.

---

### User Story 5 - Switch the active user (Priority: P3)

The user opens the user control on the dashboard, enters a user ID, and the app loads that user's logs, targets, and nutrition. The choice is remembered across restarts.

**Why this priority**: This is a development and testing aid in the current app, not an everyday flow.

**Independent Test**: Switch to another user ID, restart the app, and confirm it still shows that user's data.

**Acceptance Scenarios**:

1. **Given** a valid user ID, **When** the user confirms it, **Then** the dashboard reloads with that user's data.
2. **Given** a user ID was set, **When** the app restarts, **Then** the same user is active.

---

### User Story 6 - Retire the old mobile apps (Priority: P3)

Once the native app matches every feature, the developer removes the React Native app and the old Java app from the repository and updates the project docs and constitution to describe the native Android app as the mobile client.

**Why this priority**: Clean-up only makes sense after the native app has proven parity, and it keeps the repository from having three mobile apps.

**Independent Test**: After removal, a new contributor following the docs can build and run the native app without finding references to the removed apps.

**Acceptance Scenarios**:

1. **Given** every item on the parity checklist passes, **When** the old apps are removed, **Then** the project docs point only to the native app.
2. **Given** the constitution was amended before planning (FR-021), **When** the old apps are removed, **Then** the constitution no longer mentions `mobile/` as a reference.

### Edge Cases

- The scale disconnects or goes out of range while the user is weighing: the app shows it is disconnected, stops treating the last weight as live, and reconnects when the scale returns.
- Bluetooth is turned off on the phone: the app says so and offers to connect once it is on.
- The user denies Bluetooth permission: the app explains that the scale cannot connect and mock mode remains available.
- The app goes to the background during a recording: the recording stops and nothing is uploaded.
- The recording hits the 10-second limit: recording stops and the clip is sent for transcription.
- The backend is unreachable or returns an error: the app shows a clear message and keeps what the user entered.
- The transcription returns no usable text: the user can retry or type the food name.
- Weight is negative or zero when logging: the app does not create a log with a non-positive weight.
- A calibration command is sent while disconnected: the app tells the user the scale is not connected.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The mobile client MUST be a native Android app in a new `android/` module at the repository root, replacing the React Native app with no loss of user-facing features.
- **FR-001a**: The React Native app code in `mobile/` is the reference specification. It is binding for which features exist, for backend calls, and for the scale protocol; where this document is silent or differs on those, the native app MUST follow the React Native code. For screen layout, flows, captions, and error handling it is a guide only: the native app MAY improve them, and bugs or awkward behavior in the React Native app MUST NOT be copied on purpose.
- **FR-002**: The app MUST request Bluetooth permission, scan for the scale, connect to a chosen device, and remember it for automatic reconnect.
- **FR-003**: The app MUST decode weight notifications from the scale using the existing protocol in `docs/mobile-app/design.md` (same service and characteristic identifiers, 4-byte signed little-endian grams) and show the live weight.
- **FR-004**: The app MUST mark a reading as stable when the same gram value repeats across the stability window, as the current app does.
- **FR-005**: The app MUST send Tare and Calibrate commands in the existing command format, and provide the Set Zero and Set Calibration Weight calibration flow.
- **FR-006**: The app MUST support disconnect and Forget All Devices.
- **FR-007**: The app MUST provide a mock mode that simulates weights and local tare when no scale is connected, behind the same interface as the real scale connection.
- **FR-008**: The app MUST record voice clips of up to 10 seconds after microphone permission is granted, send them to the existing backend transcription service, and use the result as the food search text.
- **FR-009**: The app MUST search foods through the existing backend search and let the user pick a result.
- **FR-010**: The app MUST create, edit, and delete food logs through the existing backend, and ask for confirmation before deleting.
- **FR-011**: The dashboard MUST show today's food logs with name and time, grouped when entries are within 30 minutes of each other.
- **FR-012**: The dashboard MUST provide a two-page carousel with a Nutrition page (today's totals against daily targets) and a Scale page (live weight and logging controls).
- **FR-013**: The app MUST let the user create a recipe with a name, an optional positive serving size in grams, and weighed ingredients, and save it in one request through the existing backend.
- **FR-014**: The app MUST let the user set the active user ID and remember it, along with the stored scale, across restarts.
- **FR-015**: The app MUST work against the existing backend without backend changes; any gap found MUST be recorded and resolved in a separate backend change.
- **FR-016**: User-visible captions MUST stay hard-coded in the UI file that renders them, following the project constitution.
- **FR-017**: The React Native app MUST stay in the repository and working until every item on the parity checklist passes in the native app.
- **FR-018**: After parity, the React Native app (`mobile/`) and the old Java app (`android-legacy/`) MUST be removed, and `README.md`, `AGENTS.md`, and `docs/mobile-app/` MUST be updated to describe the native app. The constitution's mention of `mobile/` as the reference MUST be dropped at the same time.
- **FR-021**: Before planning starts, the constitution MUST be amended so that `android/` is the mobile module and `mobile/` is only the reference until parity. The amendment is a MAJOR version change.
- **FR-019**: The old Java app MUST NOT be converted in place; the native app starts as a new project, using the old app only as a reference for native Bluetooth handling.
- **FR-020**: Parity MUST be verified by hand on the developer's Android phone, walking every item on the parity checklist. Automated tests are not required for this feature.

### Key Entities

- **Scale device**: The remembered scale the app reconnects to. Identified by its device address.
- **Weight reading**: The latest gram value from the scale or mock mode, with a stable flag.
- **Food log**: A logged food with name, weight, time, and owner, stored by the backend.
- **Recipe draft**: A local, unsaved recipe with a name, an optional serving size, and weighed ingredients, saved to the backend in one step.
- **Active user**: The user ID whose logs, targets, and nutrition the app shows.
- **Parity checklist**: The list of features in the React Native code (`mobile/src`) that the native app must match before the old apps are removed, derived screen by screen and service by service from that code.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the features listed in the parity checklist are available and working in the native app on the developer's Android phone before the React Native app is removed. Parity means each feature is present, not that it looks or behaves identically.
- **SC-002**: 20 voice recordings in a row succeed from tap to transcribed text, with no recorder errors.
- **SC-003**: After opening the app with a remembered scale powered on, the live weight appears within 5 seconds.
- **SC-004**: The displayed weight matches the scale's own reading for 10 reference weights, within the scale's resolution.
- **SC-005**: A small UI change reaches the phone in under 30 seconds during development.
- **SC-006**: Peak memory used by the development build and run on the developer's machine is lower than the current React Native setup, measured the same way for both.
- **SC-007**: After removal, the project docs and constitution contain no instructions that point to the removed apps.

## Assumptions

- The app targets Android only. iOS is out of scope; if it is ever needed, it would be a separate port.
- The target stack is modern native Android, Kotlin with Jetpack Compose, as requested. Library choices belong in the plan.
- The native app lives in `android/` at the repository root, separate from `mobile/` (including its generated `mobile/android` build folder) and `android-legacy/`.
- Minimum Android version stays at the level the old Java app used (Android 14, API 34), since the app runs on the developer's own phones.
- Parity is measured against the current React Native app. Features still being specified, such as `specs/001-add-user-food`, are built in the native app after parity rather than in the React Native app.
- The scale firmware, Bluetooth protocol, and backend API do not change as part of this feature.
- The backend base URL is configured the same way as today, for local development.
- The constitution currently names React Native as the mobile stack; FR-021 amends it before planning.
