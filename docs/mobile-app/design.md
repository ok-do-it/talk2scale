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
│   TARE     │     MIC     │  two equal-width buttons
├────────────┴─────────────┤
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
- **Mic button** — opens the speech recognition overlay (see below). Food name input and Apply have moved into the overlay.
- **Log table** — `RecyclerView` filling remaining space. Columns: food name, weight (g), calories. Rows added in session order, most recent at top. **In-memory only** — the list lives in the `ViewModel` and is lost when the process dies.

| Widget | Action | Detail |
|--------|--------|--------|
| Connect | overlay | Opens connection overlay ([details](connection-overlay.md)) |
| Calibrate | overlay | Opens calibration overlay ([details](calibration-flow.md)) |
| Weight display | passive | Updated by BLE notifications; color reflects phone-side stability check |
| Tare | BLE write | Sends `0x01` to write characteristic |
| Mic | speech overlay | Opens the speech recognition overlay (see below) |
| Log table | display | Scrollable in-memory list of logged entries for current session |

### Speech recognition overlay (full-screen)

Opened by the **Mic** button on the main screen. Covers the entire screen
(same pattern as the connection and calibration overlays). Z-order is above
the calibration overlay but below the connection overlay, so a disconnect
still blocks interaction.

```
┌──────────────────────────┐
│                          │
│        ( ● mic )         │  mic icon with pulsing ring while recording
│                          │
│      Listening…          │  status label (changes per state)
│                          │
│  [ recognized food name ]│  editable EditText, filled by STT
│                          │
│        ( ■ stop )        │  toggle button: ■ stop while recording,
│                          │                  ● mic  while idle
│                          │
│                          │
│   [ CANCEL ]  [ APPLY ]  │  bottom action bar
└──────────────────────────┘
```

**Layout:** `view_speech_overlay.xml`, included into `activity_main.xml`
via `<include>`.

**Controller:** `SpeechOverlayController` — a standalone class that owns the
`SpeechRecognizer` lifecycle and all overlay view state. `MainActivity`
creates it in `bindViews()` and communicates through a `Callback` interface
(`onApply(String)`, `onCancel()`).

#### Overlay states

| State | Status label | Toggle icon | Pulse ring | Trigger |
|-------|-------------|-------------|------------|---------|
| Recording | "Listening…" | stop (square) | visible, animating | `open()` / toggle tap while idle |
| Idle | "Tap mic to start" | mic (circle) | hidden | `onEndOfSpeech` / toggle tap while recording |
| Error | "Could not recognise speech — try again" | mic (circle) | hidden | `onError` (no match / timeout) |
| No permission | "Microphone permission denied" | mic (circle) | hidden | runtime permission denied |
| Unavailable | "Speech recognition not available on this device" | mic (circle) | hidden | `SpeechRecognizer.isRecognitionAvailable()` is false |

#### Flow

```
User taps MIC button (main screen)
  │
  ├─ RECORD_AUDIO permission granted?
  │   ├─ YES → open overlay, auto-start SpeechRecognizer
  │   └─ NO  → open overlay in idle state,
  │             launch runtime permission request
  │             ├─ granted → startListening()
  │             └─ denied  → show "Microphone permission denied",
  │                          user can Cancel or retry from Settings
  │
  ├─ SpeechRecognizer delivers partial results
  │   → stream into EditText (user sees text forming)
  │
  ├─ SpeechRecognizer delivers final result
  │   → set EditText to top result, switch to idle state
  │   → user can edit text by hand
  │
  ├─ User taps toggle button (idle)
  │   → re-create SpeechRecognizer, start listening (retry)
  │
  ├─ User taps toggle button (recording)
  │   → stopListening(), keep current text, switch to idle
  │
  ├─ User taps APPLY
  │   → stop any active recognition
  │   → validate: food text non-empty, stable weight > 0
  │   │   ├─ OK  → addLogEntry(), sendTare(), close overlay
  │   │   └─ FAIL → show toast, overlay stays open
  │
  └─ User taps CANCEL
      → stop recognition, destroy recognizer, close overlay
        (no log entry added)
```

#### SpeechRecognizer details

- A fresh `SpeechRecognizer` instance is created for each listening session
  (and destroyed in `stopListening` / `close`) to avoid stale-state issues.
- Intent extras: `LANGUAGE_MODEL_FREE_FORM`, device default locale,
  `EXTRA_PARTIAL_RESULTS = true`, `EXTRA_MAX_RESULTS = 1`.
- `RecognitionListener.onPartialResults` updates the `EditText` live;
  `onResults` sets the final text and transitions to idle.
- `onError` handles `ERROR_NO_MATCH` and `ERROR_SPEECH_TIMEOUT` with a
  user-friendly message; `ERROR_INSUFFICIENT_PERMISSIONS` shows the
  permission-denied message; all others show a generic retry prompt.

#### Recording animation

While recording, a translucent pulsing ring (`speechPulseRing`) animates
behind the mic icon using a scale + alpha `<set>` animation
(`res/anim/pulse.xml`). The ring is hidden and its animation cleared when
the recognizer transitions to idle.

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

- The Mic button opens a full-screen speech overlay (`SpeechOverlayController`)
  which manages a `SpeechRecognizer` instance internally. See
  [Speech recognition overlay](#speech-recognition-overlay-full-screen) for the
  full layout, states, and flow.
- Recognition uses `RecognizerIntent.ACTION_RECOGNIZE_SPEECH` with
  `LANGUAGE_MODEL_FREE_FORM`, partial results enabled.
- On `onResults`, the top result string is placed into the overlay's `EditText`.
  Partial results stream into the same field as the user speaks.
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
