# ESP32 firmware behavior

This document describes how [`esp32/src/main.cpp`](../../esp32/src/main.cpp) behaves at runtime. For wire-level BLE payloads and GPIO wiring, see [`docs/hardware/README.md`](../hardware/README.md) and [`docs/hardware/schematics.md`](../hardware/schematics.md).

## Role

The firmware drives an **HX711** load-cell front end and exposes a **BLE GATT server** so a phone app can scan, connect, subscribe to weight updates, and send **tare** and **calibrate** commands.

## BLE discovery and bonding

The firmware supports **BLE Secure Connections bonding** ("Just Works" — no PIN). A bonding flag is persisted in **NVS** (`Preferences` namespace `ble`, key `bonded`) so the device remembers whether a phone has paired.

- **First boot (no bond in NVS):** the device starts **open undirected advertising** after the GATT service is registered. Any phone can discover and connect; the BLE stack will initiate bonding automatically. On successful bond the flag is written to NVS.
- **Subsequent boots (bond in NVS):** the device advertises normally. The bonded phone's OS auto-reconnects; characteristics require **encrypted** access so only the bonded peer can subscribe or write.
- **While a central is connected**, the stack stops advertising (normal BLE behavior).
- **After disconnect**, firmware restarts advertising.
- **Long-press pair button (GPIO13, >= 3 s):** wipes the Bluedroid bond list and clears the NVS flag, then restarts open advertising so a new phone can pair. Short presses on the pair button are ignored.

There is **no** time limit on advertising while idle.

## Boot (`setup`)

1. **Serial** starts at 115200 baud; a short delay allows the USB serial bridge to attach.
2. **GPIO15** is configured as **INPUT_PULLUP** for the hardware tare button (ties to GND when pressed).
3. **GPIO13** is configured as **INPUT_PULLUP** for the pair button (ties to GND when pressed).
4. **HX711** starts on **GPIO4** (data) and **GPIO16** (clock), with default scale factor `1.0f`, then **tare** using 15 samples.
5. **Calibrated flag** is set to `true` only if the compile-time scale factor is not `1.0f` (otherwise the device reports **uncalibrated** until a successful BLE calibrate).
6. **Preferences** opens namespace `ble` and reads the `bonded` flag to determine whether a bond already exists.
7. **BLE** initializes with device name `TalkToScale`, configures **encryption** (`ESP_BLE_SEC_ENCRYPT`), **Secure Connections bonding** (`ESP_LE_AUTH_REQ_SC_BOND`), and **Just Works** I/O capability (`ESP_IO_CAP_NONE`). Creates a **server**, one **service**, two **characteristics** (notify + write) with **encrypted access permissions**, and **starts advertising**.

## Main loop (`loop`)

Each iteration runs roughly every **200 ms** (~5 Hz).

### Tare button (GPIO15)

- Detects a **press** on the **falling edge** (not pressed → pressed), with a **300 ms cooldown** between accepted presses.
- Runs **hardware tare** (`scale.tare(15)`) and resets the **stability counter** so the stable flag does not stay true from before the tare.

### Pair button (GPIO13)

- Tracks press **duration**. On **falling edge** the timer starts.
- If held **>= 3 seconds**: calls `clearBond()` which removes all entries from the Bluedroid bond device list, clears the NVS `bonded` flag, and restarts open advertising. A guard prevents re-triggering while the button is still held.
- **Short presses** are ignored (no action on release before the threshold).

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

The notify characteristic includes a **Client Characteristic Configuration** descriptor (standard **0x2902**) so the central can enable notifications. Both characteristics require **encrypted** access (`ESP_GATT_PERM_READ_ENCRYPTED` / `ESP_GATT_PERM_WRITE_ENCRYPTED`), enforcing bonding before use.

## BLE security

- **Mode:** BLE Secure Connections, "Just Works" (no display or keyboard on the scale).
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
| `0x01` | **TARE** | None (length 1 is enough). Runs `tare(15)` and resets stability count. |
| `0x02` | **CALIBRATE** | Bytes 1–2: **uint16** reference mass in grams, **little-endian**. Firmware takes **20-sample** raw average (`read_average(20)`), then `set_scale(avg / ref_mass_g)`. Sets **calibrated** on success. Ignores zero reference mass or zero average. |

Any other opcode is logged as unknown on Serial.

## Build configuration

[`esp32/platformio.ini`](../../esp32/platformio.ini) uses the **`min_spiffs`** partition table to leave room for the Bluetooth stack. The only external library dependency is **bogde/HX711**; BLE comes from the **Arduino-ESP32** core.

## Not implemented (by design)

- **NVS** persistence of HX711 offset/scale across power cycles (see hardware README for a future approach).
