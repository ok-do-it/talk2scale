# ESP32 firmware behavior

This document describes how [`esp32/src/main.cpp`](../../esp32/src/main.cpp) behaves at runtime. For wire-level BLE payloads and GPIO wiring, see [`docs/hardware/README.md`](../hardware/README.md) and [`docs/hardware/schematics.md`](../hardware/schematics.md).

## Role

The firmware drives an **HX711** load-cell front end and exposes a **BLE GATT server** so a phone app can scan, connect, subscribe to weight updates, and send **tare** and **calibrate** commands.

## BLE discovery

- **Advertising starts at boot** after the GATT service is registered, so the device is discoverable whenever it is powered and not connected.
- **While a central is connected**, the stack stops advertising (normal BLE behavior).
- **After disconnect**, firmware **starts advertising again** so the app can reconnect without power-cycling the scale.

There is **no** separate “pairing mode” button and **no** time limit on advertising while idle. Bonding / stored pairing keys are not implemented (see [Not implemented](#not-implemented-by-design)).

## Boot (`setup`)

1. **Serial** starts at 115200 baud; a short delay allows the USB serial bridge to attach.
2. **GPIO15** is configured as **INPUT_PULLUP** for the hardware tare button (ties to GND when pressed).
3. **HX711** starts on **GPIO4** (data) and **GPIO16** (clock), with default scale factor `1.0f`, then **tare** using 15 samples.
4. **Calibrated flag** is set to `true` only if the compile-time scale factor is not `1.0f` (otherwise the device reports **uncalibrated** until a successful BLE calibrate).
5. **BLE** initializes with device name `TalkToScale`, creates a **server**, one **service**, two **characteristics** (notify + write), configures the **advertising** payload (service UUID), and **starts advertising**.

## Main loop (`loop`)

Each iteration runs roughly every **200 ms** (~5 Hz).

### Tare button (GPIO15)

- Detects a **press** on the **falling edge** (not pressed → pressed), with a **300 ms cooldown** between accepted presses.
- Runs **hardware tare** (`scale.tare(15)`) and resets the **stability counter** so the stable flag does not stay true from before the tare.

### Weight read and stability

- Weight is read with **`get_units(10)`** (10-sample average from the HX711 library).
- **Stability**: consecutive readings must stay within **2 g** of the **previous** reading. The counter increments up to **5**; when it reaches **5**, the reading is considered **stable**. Any larger jump resets the counter.
- Weight is **clamped** to **int16** range for the notify payload (±32767 g).

### BLE notify

- If a **client is connected**, the firmware pushes a **3-byte** notification every loop iteration:
  - Bytes 0–1: **int16** weight in grams, **little-endian**.
  - Byte 2: **flags** — bit 0 **stable**, bit 1 **calibrated** (see [`docs/hardware/README.md`](../hardware/README.md)).

### Serial

- Prints weight (two decimal places), whether the scale is **uncalibrated**, and **stable** vs **settling**.

## BLE GATT layout

| Item | UUID |
|------|------|
| Service | `4c78c001-8118-4aea-8f72-70ddbda3c9b9` |
| Notify (weight + flags) | `4c78c002-8118-4aea-8f72-70ddbda3c9b9` |
| Write (commands) | `4c78c003-8118-4aea-8f72-70ddbda3c9b9` |

The notify characteristic includes a **Client Characteristic Configuration** descriptor (standard **0x2902**) so the central can enable notifications.

## Connection lifecycle

- **onConnect**: marks connected. The BLE stack stops advertising while the link is active.
- **onDisconnect**: marks disconnected and calls **`getAdvertising()->start()`** so the device is discoverable again for the next connection.

## Write characteristic (commands)

The central writes a byte string; the first byte is the **opcode**.

| Opcode | Meaning | Payload |
|--------|---------|---------|
| `0x01` | **TARE** | None (length 1 is enough). Runs `tare(15)` and resets stability count. |
| `0x02` | **CALIBRATE** | Bytes 1–2: **uint16** reference mass in grams, **little-endian**. Firmware takes **20-sample** raw average (`read_average(20)`), then `set_scale(avg / ref_mass_g)`. Sets **calibrated** on success. Ignores zero reference mass or zero average. |

Any other opcode is logged as unknown on Serial.

## Build configuration

[`esp32/platformio.ini`](../../esp32/platformio.ini) uses the **`min_spiffs`** partition table to leave room for the Bluetooth stack. The only external library dependency is **bogde/HX711**; BLE comes from the **Arduino-ESP32** core.

## Not implemented (by design)

- **NVS** persistence of offset/scale across power cycles (see hardware README for a future approach).
- **BLE bonding** / encrypted pairing and **stored** peer list (phone may still show the device under recent Bluetooth devices depending on OS).
