# Mobile app — BLE design

Target: Native Android (Java), min SDK 31 (Android 12).

## BLE stack

Uses the Android SDK directly — no third-party BLE library.

- Device picker: `android.companion.CompanionDeviceManager` (system bottom-sheet)
- Connect / GATT: `android.bluetooth.BluetoothGatt`, `BluetoothGattCallback`
- Descriptors: `android.bluetooth.BluetoothGattDescriptor` (CCCD 0x2902)

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
```

`CompanionDeviceManager` performs the BLE scan internally, so `BLUETOOTH_SCAN` and
`ACCESS_FINE_LOCATION` are **not** needed. Only `BLUETOOTH_CONNECT` is required
(requested at runtime before any GATT operation).

## Connection flow

```
App launch (MainActivity.onCreate)
  │
  ├─ Has stored MAC in SharedPreferences?
  │   ├─ YES → BluetoothAdapter.getRemoteDevice(mac)
  │   │         → device.connectGatt(ctx, true, gattCallback)
  │   │         → onConnectionStateChange → discoverServices
  │   │         → subscribe to notifications
  │   │
  │   └─ NO  → CompanionDeviceManager.associate(request, ...)
  │            → system shows bottom-sheet with "TalkToScale"
  │            → user taps → onActivityResult returns BluetoothDevice
  │            → connectGatt → store MAC → subscribe
  │
  └─ On disconnect (power cycle, out of range)
      → autoConnect=true keeps retrying in background
      → UI shows "Reconnecting…" until onConnectionStateChange fires
```

### First connection (CompanionDeviceManager)

`MainActivity` checks `SharedPreferences` on launch. When no MAC is stored it
immediately starts the companion association — no custom scan UI needed.

1. Request `BLUETOOTH_CONNECT` permission.
2. Build an association request filtered by service UUID:
   ```java
   BluetoothLeDeviceFilter filter = new BluetoothLeDeviceFilter.Builder()
       .setScanFilter(new ScanFilter.Builder()
           .setServiceUuid(new ParcelUuid(SERVICE_UUID))
           .build())
       .build();

   AssociationRequest request = new AssociationRequest.Builder()
       .addDeviceFilter(filter)
       .setSingleDevice(true)   // skip the list, auto-select the match
       .build();

   CompanionDeviceManager cdm = getSystemService(CompanionDeviceManager.class);
   cdm.associate(request, callback, null);
   ```
   `setSingleDevice(true)` — when exactly one device matches (the typical case)
   the system can auto-select it; otherwise a picker is shown.
3. In the `CompanionDeviceManager.Callback`:
   ```java
   @Override
   public void onDeviceFound(IntentSender chooserLauncher) {
       startIntentSenderForResult(chooserLauncher, SELECT_DEVICE_REQUEST, ...);
   }
   ```
4. In `onActivityResult`, extract the device and connect:
   ```java
   BluetoothDevice device = result.getParcelableExtra(
       CompanionDeviceManager.EXTRA_DEVICE);
   device.connectGatt(this, false, gattCallback);
   ```
5. `onConnectionStateChange(STATE_CONNECTED)` → `gatt.discoverServices()`.
6. `onServicesDiscovered` → enable notifications (see below).
7. Store `device.getAddress()` in `SharedPreferences`.

### Reconnection after scale power cycle

- On app launch (or after disconnect), retrieve the stored MAC and call
  `adapter.getRemoteDevice(mac).connectGatt(ctx, true, gattCallback)`.
- `autoConnect = true` tells the Android BLE controller to passively wait for the
  peripheral's advertisement and connect when seen — low power, no active scan.
- Firmware already re-advertises on boot and after disconnect; no changes needed.

### Bonding

The firmware characteristics use encrypted permissions (`ESP_GATT_PERM_READ_ENCRYPTED`,
`ESP_GATT_PERM_WRITE_ENCRYPTED`) and request Secure Connections bonding.
The app does **not** need to call any bonding API explicitly — Android triggers
bonding automatically on the first read/write to an encrypted characteristic.
After bonding the keys are persisted by the OS; subsequent connections skip the
pairing dialog.

To re-pair (e.g. after a firmware flash that clears NVS), the user can either:

- Long-press the physical **Pair** button on the scale (clears the bond on the ESP32 side), or
- Use "Forget Scale" in the app, which also removes the OS-level bond (see below).

### Forgetting the scale

1. Remove the companion association:
   ```java
   CompanionDeviceManager cdm = getSystemService(CompanionDeviceManager.class);
   cdm.disassociate(mac);
   ```
2. Remove the OS bond via reflection (no public API):
   ```java
   BluetoothDevice device = adapter.getRemoteDevice(mac);
   device.getClass().getMethod("removeBond").invoke(device);
   ```
3. Clear the stored MAC from `SharedPreferences`.
4. Next launch falls back to the `CompanionDeviceManager.associate()` flow.

## Notifications (weight stream)

Firmware pushes a 3-byte notification every ~200 ms (~5 Hz) as soon as a client
is connected and subscribed:

| Offset | Type | Content |
|--------|------|---------|
| 0–1 | `int16` LE | Weight in grams (signed, ±32 767) |
| 2 | `uint8` | Bit 0 = stable, Bit 1 = calibrated |

### Subscribing

```java
BluetoothGattCharacteristic notifyChar =
    service.getCharacteristic(NOTIFY_CHAR_UUID);
gatt.setCharacteristicNotification(notifyChar, true);

BluetoothGattDescriptor cccd =
    notifyChar.getDescriptor(UUID.fromString("00002902-0000-1000-8000-00805f9b34fb"));
cccd.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
gatt.writeDescriptor(cccd);
```

No "start" command is needed — notifications begin once the CCCD is written.

### Parsing

```java
// inside onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic c)
byte[] v = c.getValue();
short weightGrams = ByteBuffer.wrap(v, 0, 2).order(ByteOrder.LITTLE_ENDIAN).getShort();
boolean stable     = (v[2] & 0x01) != 0;
boolean calibrated = (v[2] & 0x02) != 0;
```

## Commands (write characteristic)

Commands are fire-and-forget writes mapped to UI actions.

| Command | Opcode | Payload | Trigger |
|---------|--------|---------|---------|
| Tare | `0x01` | — | "Tare" button |
| Calibrate | `0x02` | `uint16` LE ref mass (g) | "Calibrate" button + text input for reference weight |

### Encoding

```java
// Tare — 1 byte
byte[] tare = new byte[]{ 0x01 };

// Calibrate — 3 bytes: opcode + uint16 LE reference mass
ByteBuffer buf = ByteBuffer.allocate(3).order(ByteOrder.LITTLE_ENDIAN);
buf.put((byte) 0x02);
buf.putShort((short) refMassGrams);
byte[] calibrate = buf.array();
```

Write with response:

```java
BluetoothGattCharacteristic writeChar =
    service.getCharacteristic(WRITE_CHAR_UUID);
writeChar.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
writeChar.setValue(payload);
gatt.writeCharacteristic(writeChar);
```

## Speech-to-text

The app uses `android.speech.SpeechRecognizer` for on-device recognition, or
sends audio to **Whisper** via the backend.

| | Built-in (`SpeechRecognizer`) | Whisper API |
|--|-------------------------------|-------------|
| **Cost** | Free | Pay per minute |
| **Privacy** | Audio handled by OS / Google on-device | Audio sent to OpenAI |
| **Quality** | Good for general dictation; rare food terms may miss | Better for noisy audio and uncommon words |
| **Offline** | Possible with offline language packs (device-dependent) | Requires network |

## ESP32 firmware changes required

None. Current advertising and GATT behavior already supports this flow.
