# Hardware

This folder holds **schematics, wiring diagrams, and hardware notes** for the Talk to Scale build.

## Contents (as you add them)

- [Load cell → HX711 → ESP32 wiring](schematics.md) (text + diagrams)  
- Connection diagram: load cells → HX711 → ESP32 DevKit  
- GPIO map (tare button, pair button, power, optional battery sense)  
- BOM snippets for the custom PCB or breadboard build  
- Photos or PDFs exported from your CAD tool  

## NVS plan (scale calibration)

Persist **HX711 offset** (tare / bias) and **scale factor** (grams per count) so the device does not need a full recalibration after every power cycle.

| Item | Role |
|------|------|
| **Offset** | Long-term zero after tare; maps empty platform to 0. |
| **Scale factor** | Converts raw reading to mass (e.g. grams). |

**Suggested approach (ESP32):** use **Preferences** (NVS under the hood) with a small namespace (e.g. `scale`) and keys such as `offset` (int64 or long, matching the HX711 library) and `scale` (float).

**Boot flow:** open namespace → if keys exist and pass sanity checks, `set_offset` / `set_scale` on the HX711 driver; otherwise run one-time tare + default scale (or factory prompt) and optionally write values after user calibration.

**Operational note:** keep a **tare** action in the product flow; zero drifts with temperature and mechanical settling. Recalibration or NVS updates when the user runs a calibration routine.

## GPIO summary

| GPIO | Function | Wiring |
|------|----------|--------|
| **4** | HX711 DT (data) | HX711 `DOUT` → GPIO4 |
| **16** | HX711 SCK (clock) | HX711 `SCK` → GPIO16 |
| **15** | Tare button | Button to GND, INPUT_PULLUP |
| **13** | Pair button | Button to GND, INPUT_PULLUP |

## BLE discovery and bonding (firmware behavior)

The firmware uses **BLE Secure Connections bonding** ("Just Works"). A **pair button** on **GPIO13** (INPUT_PULLUP, ties to GND when pressed) allows clearing the stored bond:

- **No bond in NVS:** open advertising after boot; any phone can connect and bond.
- **Bond in NVS:** advertising resumes normally; the bonded phone auto-reconnects. Characteristics require encrypted access so unbonded phones cannot use them.
- **Long-press pair button (>= 3 s):** clears all bonded devices from the Bluedroid stack and the NVS flag, restarts open advertising for a new phone to pair.
- Advertising **stops while a phone is connected** and **resumes after disconnect**.

## BLE packet layout

### Notify characteristic (weight + flags)

| Field | Type | Bytes | Description |
|-------|------|-------|-------------|
| weight | `int32` (LE, signed) | 4 | Grams (signed to allow slight negative drift after tare). When uncalibrated (`kScaleFactor == 1.0`), carries raw HX711 counts. |
| flags | `uint8` | 1 | Bit 0 — stable (1 = reading settled); Bit 1 — calibrated (1 = scale factor set, 0 = uncalibrated); Bits 2–7 reserved |

**Total payload: 5 bytes** — fits well within the default 20-byte ATT value limit (BLE default MTU 23 − 3 header).

### Write characteristic (commands)

| Command | Opcode (`uint8`) | Payload | Description |
|---------|-------------------|---------|-------------|
| TARE | `0x01` | — | Zero the scale (same as the physical tare button) |
| CALIBRATE | `0x02` | `uint16` (LE) reference mass in grams | Firmware derives scale factor from current raw reading and the supplied reference mass |

UUIDs and any additional error/ack semantics will be defined in `esp32/` firmware as implemented.

---

Place files here with clear names, for example:

- `wiring-overview.png` or `.pdf`  
- `bom.md` or `bom.csv`  
- `esp32-gpio.md`  

The main project overview lives in the [repository root README](../../README.md).
