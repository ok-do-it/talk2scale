# ESP32 firmware behavior

This document describes runtime behavior of the ESP32 sketch. The entry point is [`esp32/src/main.cpp`](../../esp32/src/main.cpp), which calls `setupUX()` / `setupScale()` / `setupBLE()` defined in [`esp32/src/ux.h`](../../esp32/src/ux.h), [`esp32/src/scale.h`](../../esp32/src/scale.h), and [`esp32/src/ble.h`](../../esp32/src/ble.h). Shared constants live in [`esp32/src/definitions.h`](../../esp32/src/definitions.h). For wire-level BLE payloads and GPIO wiring, see [`docs/hardware/README.md`](../hardware/README.md) and [`docs/hardware/schematics.md`](../hardware/schematics.md).

## Role

The firmware drives an **HX711** load-cell front end and exposes a **BLE GATT server** so a phone app can scan, connect, subscribe to weight updates, and send **tare** and **calibrate** commands.

## BLE discovery and bonding

The firmware supports **BLE Secure Connections bonding** ("Just Works" — no PIN). A bonding flag is persisted in **NVS** (`Preferences` namespace `ble`, key `bonded`) so the device remembers whether a phone has paired.

- **First boot (no bond in NVS):** the device starts **open undirected advertising** after the GATT service is registered. Any phone can discover and connect; the BLE stack will initiate bonding automatically. On successful bond the flag is written to NVS.
- **Subsequent boots (bond in NVS):** the device advertises normally. The bonded phone's OS auto-reconnects; characteristics require **encrypted** access so only the bonded peer can subscribe or write.
- **While a central is connected**, the stack stops advertising (normal BLE behavior).
- **After disconnect**, firmware restarts advertising.
- **Long-press pair button (GPIO17, >= 3 s):** wipes the Bluedroid bond list and clears the NVS flag, then restarts open advertising so a new phone can pair. Short presses on the pair button are ignored.

There is **no** time limit on advertising while idle.

## Boot (`setup`)

1. **Serial** starts at 115200 baud; a short delay allows the USB serial bridge to attach.
2. **`setupUX()`** (in `ux.h`): **GPIO15** and **GPIO17** are **INPUT_PULLUP** for the tare and pair buttons (tie to GND when pressed). **GPIO2** (onboard LED) is driven by a **FreeRTOS task**: **blinks** (250 ms on / 250 ms off) while **no** central is connected, **solid on** while connected.
3. **`setupScale()`** (in `scale.h`): **HX711** on **GPIO4** (DT) and **GPIO16** (SCK). After a short warmup read, firmware waits **`kBootTareSettleMs`** (2 s) for mechanical/HX711 settle, then takes **`kTareAverageSamples`** (30) samples via **`read_average`** and sets **tare offset** and **`latestRaw`** to that value. Only then does it start the **`scale`** FreeRTOS task (periodic short averages for live weight). **Tare offset is not stored in NVS** (fresh zero every power-on). **`loadCalibration()`** may load **scale factor** from NVS and set **calibrated**.
4. **Calibrated flag** is `true` after a successful BLE calibrate (and after boot if a valid scale factor was loaded from NVS); otherwise the notify payload reflects **uncalibrated** raw scaling until calibration.
5. **`setupBLE()`** (in `ble.h`): **Preferences** opens namespace `ble` and reads the `bonded` flag. **BLE** initializes as device `TalkToScale`, with **encryption** (`ESP_BLE_SEC_ENCRYPT`), **Secure Connections bonding** (`ESP_LE_AUTH_REQ_SC_BOND`), **Just Works** (`ESP_IO_CAP_NONE`), and **initiator encryption key distribution** (`ESP_BLE_ENC_KEY_MASK | ESP_BLE_ID_KEY_MASK`). Creates a **server**, one **service**, two **characteristics** (notify + write) with **encrypted access permissions**, and **starts advertising**.

## Main loop (`loop`)

The loop runs about every **10 ms**. **Weight notifications** are sent at **~333 ms** (~3 Hz) when a client is connected.

### Tare button (GPIO15)

- Detects a **press** on the **falling edge** (not pressed → pressed), with a **300 ms cooldown** between accepted presses.
- Runs **`performTareLongAverage()`**: suspends the **`scale`** task, **`read_average(kTareAverageSamples)`**, updates **tare offset** and **`latestRaw`**, then resumes the task.

### Pair button (GPIO17)

- Tracks press **duration**. On **falling edge** the timer starts.
- If held **>= 3 seconds**: calls `clearBond()` which removes all entries from the Bluedroid bond device list, clears the NVS `bonded` flag, and restarts open advertising. A guard prevents re-triggering while the button is still held.
- **Short presses** are ignored (no action on release before the threshold).

### Weight read

- Live weight uses **`getWeight()`**: **`latestRaw`** from the background task (short **`read_average(3)`** every **10 ms**) minus **tare offset**, divided by **scale factor**.
- Weight is rounded to the nearest gram and encoded as **int32** in the notify payload. When uncalibrated (`scaleFactor == 1.0f` and not loaded from NVS), values are effectively raw HX711 counts relative to tare.

### BLE notify

- If a **client is connected**, the firmware pushes a **4-byte** notification about every **333 ms**:
  - Bytes 0–3: **int32** weight in grams, **little-endian**.

### Serial

- When **`DEBUG_SERIAL`** is enabled, prints weight (two decimal places) about once per second and **`g`** when calibrated.

## BLE GATT layout

| Item | UUID |
|------|------|
| Service | `4c78c001-8118-4aea-8f72-70ddbda3c9b9` |
| Notify (weight + flags) | `4c78c002-8118-4aea-8f72-70ddbda3c9b9` |
| Write (commands) | `4c78c003-8118-4aea-8f72-70ddbda3c9b9` |

The notify characteristic includes a **Client Characteristic Configuration** descriptor (standard **0x2902**) so the central can enable notifications. Both characteristics require **encrypted** access (`ESP_GATT_PERM_READ_ENCRYPTED` / `ESP_GATT_PERM_WRITE_ENCRYPTED`), enforcing bonding before use.

## BLE security

- **Mode:** BLE Secure Connections, "Just Works" (no display or keyboard on the scale).
- **Key distribution:** `BLESecurity::setInitEncryptionKey(ESP_BLE_ENC_KEY_MASK | ESP_BLE_ID_KEY_MASK)` so the stack distributes encryption and identity keys during pairing.
- **Bonding keys** are stored by the Bluedroid stack in its own NVS partition automatically.
- **`SecurityCB::onAuthenticationComplete`** writes a boolean flag (`ble/bonded`) to the application NVS namespace on success. This flag is read at boot to log the bonding state.
- **`clearBond()`** iterates `esp_ble_get_bond_device_list` and calls `esp_ble_remove_bond_device` for each entry, then clears the NVS flag and restarts advertising.

## Connection lifecycle

- **onConnect**: marks connected. The BLE stack stops advertising while the link is active.
- **onAuthenticationComplete**: on successful bonding, writes `bonded = true` to NVS so the device remembers the peer across power cycles.
- **onDisconnect**: marks disconnected and calls **`startAdvertising()`** so the device is discoverable again for the next connection.

## Write characteristic (commands)

The central writes a byte string; the first byte is the **opcode**.

| Opcode | Meaning | Payload |
|--------|---------|---------|
| `0x01` | **TARE** | None (length 1 is enough). Runs **`performTareLongAverage()`** (suspend scale task, **`read_average(kTareAverageSamples)`**, update offset). |
| `0x02` | **CALIBRATE** | Bytes 1–2: **uint16** reference mass in grams, **little-endian**. Firmware uses **`latestRaw - tareOffset`**, computes **`scaleFactor = avg / ref_mass_g`**, sets **calibrated**, and **persists scale factor to NVS** on success. Ignores zero reference mass or zero average. |

Any other opcode is logged as unknown on Serial.

## Calibration procedure (from phone)

The mobile app drives a two-step calibration flow using the opcodes above. No additional firmware commands are required.

1. **Set zero** — the app sends **TARE** (`0x01`). The user must remove all items from the scale first. The firmware runs **`performTareLongAverage()`** (same long average as the hardware tare button).
2. **Set calibration weight** — the user places a known reference mass on the scale and enters its weight in grams in the app. The app sends **CALIBRATE** (`0x02` + `uint16` LE mass). The firmware uses the current **`latestRaw`** net of tare to compute **`scaleFactor`**, sets **`calibrated = true`**, and writes the factor to NVS.

After a successful calibration, subsequent weight notifications use the stored scale factor (also reloaded on boot). **Tare offset is still recomputed every boot** and is not stored in NVS.

## Build configuration

[`esp32/platformio.ini`](../../esp32/platformio.ini) uses the **`min_spiffs`** partition table to leave room for the Bluetooth stack. The only external library dependency is **bogde/HX711**; BLE comes from the **Arduino-ESP32** core.

## Not implemented (by design)

- **NVS** persistence of **HX711 tare offset** across power cycles (fresh zero each boot; scale **factor** is persisted after calibration).
