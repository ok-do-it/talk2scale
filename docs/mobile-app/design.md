# Mobile app — BLE design

Target: React Native, Android only (test device).

## Library

**`react-native-ble-plx`** — handles scan, connect, subscribe, write.
Bonding is not required; the OS handles reconnection by device address.

## BLE identifiers (from firmware)

| Item | UUID |
|------|------|
| Service | `4c78c001-8118-4aea-8f72-70ddbda3c9b9` |
| Notify (weight + flags) | `4c78c002-8118-4aea-8f72-70ddbda3c9b9` |
| Write (commands) | `4c78c003-8118-4aea-8f72-70ddbda3c9b9` |

## Connection flow

```
App launch
  │
  ├─ Has stored device ID?
  │   ├─ YES → connectToDevice(id, { autoConnect: true })
  │   │         → discoverServices → subscribe to notifications
  │   │         → if connection fails / times out → fall back to scan
  │   │
  │   └─ NO  → scan filtered by service UUID
  │            → show discovered device(s) in app UI (not system BT dialog)
  │            → user taps device → connect → store device ID → subscribe
  │
  └─ On disconnect (power cycle, out of range)
      → autoConnect keeps retrying in background
      → UI shows "Reconnecting…" until link restored
```

### First connection

1. App requests runtime permissions (`BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `ACCESS_FINE_LOCATION`).
2. `startDeviceScan([serviceUUID])` — filter by the scale's service UUID.
3. UI lists discovered peripherals (expect one: "TalkToScale").
4. User taps → `connectToDevice(id)` → `discoverAllServicesAndCharacteristics()`.
5. Store `device.id` in persistent storage (AsyncStorage / MMKV).
6. Subscribe to notify characteristic — weight packets start streaming immediately.

### Reconnection after scale power cycle

- On app launch (or after disconnect), call `connectToDevice(storedId, { autoConnect: true })`.
- `autoConnect: true` tells the Android BLE controller to passively wait for the peripheral's advertisement and connect when seen — low power, no active scan needed.
- No bonding or NVS changes required on the ESP32; firmware already re-advertises on boot and after disconnect.

### Forgetting the scale

- "Forget Scale" action in app settings clears the stored device ID.
- Next launch falls back to the scan flow for a fresh connection.

## Notifications (weight stream)

Firmware pushes a 3-byte notification every ~200 ms (~5 Hz) as soon as a client is connected and subscribed:

| Offset | Type | Content |
|--------|------|---------|
| 0–1 | `int16` LE | Weight in grams (signed, ±32 767) |
| 2 | `uint8` | Bit 0 = stable, Bit 1 = calibrated |

Subscribe via `monitorCharacteristicForService(serviceUUID, notifyCharUUID)`.
No "start" command is needed — notifications begin on subscription.

## Commands (write characteristic)

Commands are fire-and-forget writes. Each maps directly to a UI button tap.

| Command | Opcode | Payload | Trigger |
|---------|--------|---------|---------|
| Tare | `0x01` | — | "Tare" button |
| Calibrate | `0x02` | `uint16` LE ref mass (g) | "Calibrate" button + text input for reference weight |

Write via `writeCharacteristicWithResponseForService(serviceUUID, writeCharUUID, base64data)`.

## ESP32 firmware changes required

None. Current advertising and GATT behavior already supports this flow.
