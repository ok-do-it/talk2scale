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
| Notify (weight + flags) | `4c78c002-8118-4aea-8f72-70ddbda3c9b9` |
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

Shown whenever the app has no active GATT connection (first launch, reconnecting,
or after user taps Connect). Covers the entire screen so the scale UI is not
interactive while disconnected.

```
┌──────────────────────────┐
│                          │
│      (scale icon)        │
│                          │
│   Searching for scale…   │  ← status text
│      ◌  (spinner)        │
│                          │
│      [ CONNECT ]         │  ← triggers CompanionDeviceManager.associate()
│                          │
└──────────────────────────┘
```

- On first launch (no stored MAC) the overlay appears and immediately fires
  `CompanionDeviceManager.associate()`, which shows the system bottom-sheet.
- On reconnect (stored MAC, scale powered off / out of range) the overlay shows
  "Reconnecting…" with a spinner. `autoConnect=true` handles the retry.
- The **Connect** button lets the user manually re-trigger the CDM association
  (e.g. after pairing a different scale or if auto-connect stalls).
- The overlay hides as soon as `onConnectionStateChange(STATE_CONNECTED)` fires
  and services are discovered.

### Main scale screen

Visible once connected. Single-screen layout, top to bottom:

```
┌──────────────────────────┐
│  (connect)  (calibrate)  │  small icon buttons, top-right
├──────────────────────────┤
│         1 284 g          │  weight display (full width)
│  amber = unstable        │  amber when stable==false
│  blue  = stable          │  blue  when stable==true
├────────────┬─────────────┤
│   TARE     │     MIC     │  two equal-width buttons
├────────────┴─────────────┤
│ [ recognized food name ] │  editable text field
├──────────────────────────┤
│        [ APPLY ]         │  full-width button
├──────────────────────────┤
│ Food        Weight  Cal  │  scrollable log table
│ ─────────── ────── ──── │
│ Banana        120   107  │
│ Greek yogurt  200   118  │
│ …                        │
└──────────────────────────┘
```

- **Connect button** — small `ImageButton` (top bar). Opens the `CompanionDeviceManager` association dialog so the user can pair a different scale or re-pair the current one.
- **Calibrate button** — small `ImageButton` (top bar). Stub for now — shows a `Toast` ("Calibration not implemented yet"). Will later open a dialog to enter reference mass and send opcode `0x02`.
- **Weight display** — large `TextView`, full width, updated on every BLE notification (~5 Hz). Text color: amber (`#FFA000`) when `stable == false`, blue (`#1976D2`) when `stable == true`. Unit: grams only for now.
- **Tare button** — sends opcode `0x01` to the write characteristic. Scale zeroes; subsequent notifications reflect the new baseline.
- **Mic button** — starts `SpeechRecognizer` listening. On result, fills the editable food-name `EditText`. User can correct before pressing Apply.
- **Food name field** — `EditText`, populated by speech recognition, editable by hand.
- **Apply button** — takes current weight (last stable reading) + food name and appends a row to the log. Calories are mocked with `Random.nextInt(50, 350)` until the backend is available.
- **Log table** — `RecyclerView` filling remaining space. Columns: food name, weight (g), calories. Rows added in session order, most recent at top. **In-memory only** — the list lives in the `ViewModel` and is lost when the process dies.

| Widget | Action | Detail |
|--------|--------|--------|
| Connect | CDM dialog | Opens `CompanionDeviceManager.associate()` to pair / re-pair |
| Calibrate | stub | Shows a `Toast` for now; will send `0x02` later |
| Weight display | passive | Updated by BLE notifications; color reflects stable flag |
| Tare | BLE write | Sends `0x01` to write characteristic |
| Mic | STT | Starts `SpeechRecognizer`, result fills food name field |
| Food name | user edit | Editable text, pre-filled by STT |
| Apply | log entry | Captures stable weight + food name, appends to in-memory log with random calories |
| Log table | display | Scrollable in-memory list of logged entries for current session |

## Connection flow

```
App launch (MainActivity.onCreate)
  │
  ├─ Has stored MAC in SharedPreferences?
  │   ├─ YES → show overlay "Reconnecting…"
  │   │         → BluetoothAdapter.getRemoteDevice(mac)
  │   │         → device.connectGatt(ctx, true, gattCallback)
  │   │         → onConnectionStateChange → discoverServices
  │   │         → subscribe to notifications → hide overlay
  │   │
  │   └─ NO  → show overlay "Searching for scale…"
  │            → CompanionDeviceManager.associate(request, ...)
  │            → system bottom-sheet → user taps
  │            → ActivityResultLauncher callback returns BluetoothDevice
  │            → connectGatt → store MAC → subscribe → hide overlay
  │
  ├─ User taps Connect button (top bar or overlay)
  │   → same CDM associate() flow as "NO" above
  │
  └─ On disconnect (power cycle, out of range)
      → show overlay "Reconnecting…"
      → autoConnect=true keeps retrying in background
      → overlay hides when onConnectionStateChange fires
```

### First connection (CompanionDeviceManager)

`MainActivity` checks `SharedPreferences` on launch. When no MAC is stored it
shows the connection overlay and immediately starts the companion association.

1. Request `BLUETOOTH_CONNECT` permission via `ActivityResultLauncher`.
2. Build an `AssociationRequest` with a `BluetoothLeDeviceFilter` whose
   `ScanFilter` matches the service UUID. Use `setSingleDevice(true)` so the
   system auto-selects when exactly one device matches; otherwise a picker is
   shown. Call `CompanionDeviceManager.associate()`.
3. In the `CompanionDeviceManager.Callback.onDeviceFound`, wrap the
   `IntentSender` in an `IntentSenderRequest` and launch it via an
   `ActivityResultLauncher<IntentSenderRequest>` registered with
   `ActivityResultContracts.StartIntentSenderForResult` (modern API — no
   `startIntentSenderForResult` / `onActivityResult`).
4. In the result callback, extract the `BluetoothDevice` from the intent
   (`CompanionDeviceManager.EXTRA_DEVICE`) using the typed
   `getParcelableExtra(key, class)` overload, then call `connectGatt()`.
5. `onConnectionStateChange(STATE_CONNECTED)` → `gatt.discoverServices()`.
6. `onServicesDiscovered` → enable notifications (see below).
7. Store `device.getAddress()` in `SharedPreferences`.
8. Hide the connection overlay.

### Reconnection after scale power cycle

- On app launch (or after disconnect), retrieve the stored MAC and call
  `adapter.getRemoteDevice(mac).connectGatt(ctx, true, gattCallback)`.
- `autoConnect = true` tells the Android BLE controller to passively wait for the
  peripheral's advertisement and connect when seen — low power, no active scan.
- The connection overlay shows "Reconnecting…" during this wait.
- Firmware already re-advertises on boot and after disconnect; no changes needed.

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

Firmware pushes a 3-byte notification every ~200 ms (~5 Hz) as soon as a client
is connected and subscribed:

| Offset | Type | Content |
|--------|------|---------|
| 0–1 | `int16` LE | Weight in grams (signed, ±32 767) |
| 2 | `uint8` | Bit 0 = stable, Bit 1 = calibrated |

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

Parse the 3-byte payload as: `int16` LE weight (bytes 0-1) via
`ByteBuffer.wrap().order(LITTLE_ENDIAN).getShort()`, then flags byte (byte 2)
— bit 0 = stable, bit 1 = calibrated. Post the result to `LiveData`.

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

- The Mic button calls `SpeechRecognizer.startListening()` with a
  `RecognizerIntent.ACTION_RECOGNIZE_SPEECH` intent.
- On `onResults`, the top result string is placed into the food-name `EditText`.
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
