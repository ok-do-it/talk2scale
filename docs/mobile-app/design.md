# Mobile app — BLE design

Target: Native Android (Java), min SDK 31 (Android 12), compile SDK 34.

## Project setup

| Item | Value |
|------|-------|
| Language | Java |
| UI toolkit | XML layouts (View system) |
| Package | `dev.talk2scale` |
| Source layout | Flat — all classes in `dev.talk2scale` for now |
| Build | Gradle (AGP), single `app` module |
| Architecture | `MainActivity` + `ViewModel` (MVVM-lite) |
| Threading | BLE callbacks → `LiveData.postValue()` / `Handler(Looper.getMainLooper())` |
| Local persistence | In-memory only (no Room/SQLite in v1) |

## BLE stack

Uses the Android SDK directly — no third-party BLE library.

- Device picker: `android.companion.CompanionDeviceManager` (system bottom-sheet)
- Connect / GATT: `android.bluetooth.BluetoothGatt`, `BluetoothGattCallback`
- Descriptors: `android.bluetooth.BluetoothGattDescriptor` (CCCD 0x2902)
- Activity results: `ActivityResultLauncher` (modern Activity Result API — no `onActivityResult`)

## BLE identifiers (from firmware)

| Item | UUID |
|------|------|
| Service | `4c78c001-8118-4aea-8f72-70ddbda3c9b9` |
| Notify (weight) | `4c78c002-8118-4aea-8f72-70ddbda3c9b9` |
| Write (commands) | `4c78c003-8118-4aea-8f72-70ddbda3c9b9` |

## Permissions

Declared in `AndroidManifest.xml`:

```xml
<uses-feature android:name="android.hardware.bluetooth_le" android:required="true" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
```

- `BLUETOOTH_CONNECT` — requested at runtime before any GATT operation.
  `CompanionDeviceManager` performs the BLE scan internally, so `BLUETOOTH_SCAN`
  and `ACCESS_FINE_LOCATION` are **not** needed.
- `RECORD_AUDIO` — requested at runtime before the first `SpeechRecognizer` use.

Both permissions are requested via `ActivityResultLauncher<String>` (modern
Activity Result API).

## Architecture: no background Service

All BLE logic lives in `MainActivity` (+ a `ViewModel` for surviving configuration
changes). No Android `Service` or foreground notification is needed.

If the user briefly switches apps, the `BluetoothGatt` object survives as long as
the process is alive. If the system kills the process under memory pressure, the
stored MAC in `SharedPreferences` + `autoConnect=true` re-establishes the
connection

The `BluetoothGatt` reference should be held in a `ViewModel` (not the Activity
directly) so it survives configuration changes like screen rotation without
reconnecting.

## UI layout (MainActivity)

Two layers: a **connection overlay** (shown when not connected) and the **main
scale screen** underneath.

### Connection overlay (full-screen)

Managed by `ConnectionOverlayController`. Has four buttons (Connect,
Disconnect, Forget All Devices, Close) whose enabled states react to the
current BLE connection state. Visibility is manually controlled — the overlay
never auto-closes. See [`connection-overlay.md`](connection-overlay.md) for
full layout, button states, and connection flow.

### Main scale screen

Visible once connected. Single-screen layout, top to bottom:

```
┌──────────────────────────┐
│  (connect)  (calibrate)  │  small icon buttons, top-right
├──────────────────────────┤
│         1 284 g          │  weight display (full width)
│  amber = unstable        │  amber when phone-side stability=false
│  blue  = stable          │  blue  when phone-side stability=true
├────────────┬─────────────┤
│   TARE     │  MIC/CANCEL │  Mic toggles text per listening state
├────────────┴─────────────┤
│  [ recognized food name ] │  full-width EditText, filled by STT
├──────────────────────────┤
│  [  APPLY / Listening… ] │  full-width button, disabled while listening
├──────────────────────────┤
│ Food        Weight  Cal  │  scrollable log table
│ ─────────── ────── ──── │
│ Banana        120   107  │
│ Greek yogurt  200   118  │
│ …                        │
└──────────────────────────┘
```

- **Connect button** — small `ImageButton` (top bar). Opens the connection overlay (see [`connection-overlay.md`](connection-overlay.md)). If already connected, shows status; otherwise initiates pairing / reconnection.
- **Calibrate button** — small `ImageButton` (top bar). Opens a full-screen calibration overlay with a two-step flow (set zero, then set calibration weight). See [`docs/mobile-app/calibration-flow.md`](calibration-flow.md) for details.
- **Weight display** — large `TextView`, full width, updated on every BLE notification (~3 Hz). Text color: amber (`#FFA000`) when `stable == false`, blue (`#1976D2`) when `stable == true`. Stability is computed in-app from recent gram readings (5 consecutive identical values). Unit: grams only.
- **Tare button** — sends opcode `0x01` to the write characteristic. Scale zeroes; subsequent notifications reflect the new baseline.
- **Mic button** — starts inline speech recognition. Text toggles between "MIC" (idle) and "CANCEL" (listening). See [Inline speech recognition](#inline-speech-recognition) below.
- **Food name** — full-width `EditText` below Tare/Mic row. Partial recognition results stream here live; final result replaces the text. The user can also type or edit manually.
- **Apply button** — full-width `Button` below the food name field. While idle, text is "APPLY" and the button is enabled. While listening, text is "Listening..." and the button is disabled. On tap: validates food text non-empty and stable weight > 0, then calls `addLogEntry()` + `sendTare()` and clears the field.
- **Log table** — `RecyclerView` filling remaining space. Columns: food name, weight (g), calories. Rows added in session order, most recent at top. **In-memory only** — the list lives in the `ViewModel` and is lost when the process dies.

| Widget | Action | Detail |
|--------|--------|--------|
| Connect | overlay | Opens connection overlay ([details](connection-overlay.md)) |
| Calibrate | overlay | Opens calibration overlay ([details](calibration-flow.md)) |
| Weight display | passive | Updated by BLE notifications; color reflects phone-side stability check |
| Tare | BLE write | Sends `0x01` to write characteristic |
| Mic | speech | Starts/cancels inline speech recognition |
| Food name | input | `EditText` filled by STT or typed manually |
| Apply | log entry | Validates, adds log entry, tares, clears field |
| Log table | display | Scrollable in-memory list of logged entries for current session |

### Inline speech recognition

Speech recognition runs inline on the main screen — no overlay. The Mic
button, food-name `EditText`, and Apply button change state together.

#### States

| State | Mic button | Food name field | Apply button |
|-------|-----------|-----------------|--------------|
| Idle | "MIC" | editable, may contain text | "APPLY", enabled |
| Listening | "CANCEL" | shows partial results live | "Listening…", disabled |

#### Flow

```
User taps MIC (idle)
  │
  ├─ RECORD_AUDIO permission granted?
  │   ├─ YES → startListening()
  │   └─ NO  → request permission
  │             ├─ granted → startListening()
  │             └─ denied  → show toast
  │
  ├─ SpeechRecognizer delivers partial results
  │   → stream into food name EditText
  │
  ├─ SpeechRecognizer delivers final result (auto end-of-speech)
  │   → set EditText to top result, restore idle state
  │   → user can edit text, then tap APPLY
  │
  ├─ User taps MIC again (listening → cancel)
  │   → stopListening(), destroy recognizer, clear EditText
  │
  └─ User taps APPLY (idle, text present)
      → validate: food text non-empty, stable weight > 0
      │   ├─ OK   → addLogEntry(), sendTare(), clear EditText
      │   └─ FAIL → show toast
```

#### SpeechRecognizer details

- A fresh `SpeechRecognizer` instance is created for each listening session
  (and destroyed on cancel / end-of-speech) to avoid stale-state issues.
- Intent extras: `LANGUAGE_MODEL_FREE_FORM`, device default locale,
  `EXTRA_PARTIAL_RESULTS = true`, `EXTRA_MAX_RESULTS = 1`.
- `RecognitionListener.onPartialResults` updates the `EditText` live;
  `onResults` sets the final text and transitions to idle.
- `onError` with `ERROR_NO_MATCH` or `ERROR_SPEECH_TIMEOUT` shows a toast;
  other errors restore idle state silently.
- All speech logic lives directly in `MainActivity` (no separate controller
  class).

## Connection flow

The full connection flow (first pairing, reconnection, disconnect handling) is
documented in [`connection-overlay.md`](connection-overlay.md).

### Bonding

The firmware characteristics use encrypted permissions (`ESP_GATT_PERM_READ_ENCRYPTED`,
`ESP_GATT_PERM_WRITE_ENCRYPTED`) and request Secure Connections bonding.
The app does **not** need to call any bonding API explicitly — Android triggers
bonding automatically on the first read/write to an encrypted characteristic.
After bonding the keys are persisted by the OS; subsequent connections skip the
pairing dialog.

To re-pair (e.g. after a firmware flash that clears NVS), long-press the
physical **Pair** button on the scale (clears the bond on the ESP32 side), then
use the **Connect** button in the app to start a fresh CDM association.

## Notifications (weight stream)

Firmware pushes a 4-byte notification every ~333 ms (~3 Hz) as soon as a client
is connected and subscribed:

| Offset | Type | Content |
|--------|------|---------|
| 0–3 | `int32` LE | Weight in grams (signed) |

### Subscribing

After service discovery, get the notify characteristic by UUID, call
`gatt.setCharacteristicNotification()`, then write
`ENABLE_NOTIFICATION_VALUE` to its CCCD descriptor (`0x2902`). No "start"
command is needed — firmware begins pushing notifications once the CCCD is
written.

### Parsing

Override the three-arg `onCharacteristicChanged(gatt, characteristic, byte[])`
(API 33+) to receive the raw bytes directly. Also override the deprecated
two-arg variant and delegate to the three-arg one for devices running API 31-32.

Parse the 4-byte payload as: `int32` LE weight (bytes 0-3) via
`ByteBuffer.wrap().order(LITTLE_ENDIAN).getInt()`. Post the result to `LiveData`.

## Commands (write characteristic)

Commands are fire-and-forget writes mapped to UI actions.

| Command | Opcode | Payload | Trigger |
|---------|--------|---------|---------|
| Tare | `0x01` | — | "Tare" button |
| Calibrate | `0x02` | `uint16` LE ref mass (g) | "Calibrate" button + text input for reference weight |

### Encoding

- **Tare** — single byte `0x01`.
- **Calibrate** — 3 bytes: opcode `0x02` followed by the reference mass as
  `uint16` LE (use `ByteBuffer` with `LITTLE_ENDIAN` order).

### Writing

Get the write characteristic by UUID. On API 33+ use the three-arg
`gatt.writeCharacteristic(characteristic, payload, WRITE_TYPE_DEFAULT)`. On
API 31-32 fall back to `setValue()` + the legacy one-arg `writeCharacteristic()`.

## Speech-to-text

V1 uses **`android.speech.SpeechRecognizer`** (built-in Android recognition)
only. Whisper via the backend is a possible future enhancement.

- The Mic button starts inline speech recognition on the main screen. See
  [Inline speech recognition](#inline-speech-recognition) for the full flow.
- Recognition uses `RecognizerIntent.ACTION_RECOGNIZE_SPEECH` with
  `LANGUAGE_MODEL_FREE_FORM`, partial results enabled.
- On `onResults`, the top result string is placed into the food-name `EditText`.
  Partial results stream into the same field as the user speaks.
- The recognizer stops automatically on end-of-speech; the user can also
  cancel manually via the Mic button.
- The `RECORD_AUDIO` permission is requested at runtime before the first listen.
- Offline language packs may or may not be available depending on the device;
  the app does not require offline support.

## Threading model

BLE callbacks (`BluetoothGattCallback`) arrive on a binder thread. Results are
moved to the UI via `LiveData.postValue()` in the `ViewModel`. No coroutines,
RxJava, or extra thread pools in v1.

```
BluetoothGattCallback (binder thread)
  → ViewModel.weightLiveData.postValue(reading)   // thread-safe
  → MainActivity observes LiveData on main thread
  → updates TextView, RecyclerView adapter, etc.
```

`SpeechRecognizer` must be created on the main thread and delivers callbacks on
the main thread — no marshalling needed.

## Log persistence

V1 keeps the food log **in memory only** — an `ArrayList<LogEntry>` in the
`ViewModel`. The list is lost when the process is killed or the user swipes the
app away.

A future version will add Room / SQLite for local persistence and sync with the
backend.

## ESP32 firmware changes required

None. Current advertising and GATT behavior already supports this flow.
