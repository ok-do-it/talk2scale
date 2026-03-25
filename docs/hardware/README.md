# Hardware

This folder holds **schematics, wiring diagrams, and hardware notes** for the Talk to Scale build.

## Contents (as you add them)

- [Load cell → HX711 → ESP32 wiring](schematics.md) (text + diagrams)  
- Connection diagram: load cells → HX711 → ESP32 DevKit  
- GPIO map (tare button, power, optional battery sense)  
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

## BLE discovery (firmware behavior)

Advertising **starts after boot** and **resumes after disconnect** so the app can scan and connect whenever the scale is on and not linked. Advertising **stops while a phone is connected**. There is no separate pairing button on GPIO in current firmware (hardware tare uses **GPIO15** only).

## BLE packet layout

### Notify characteristic (weight + flags)

| Field | Type | Bytes | Description |
|-------|------|-------|-------------|
| weight | `int16` (LE, signed) | 2 | Grams; signed to allow slight negative drift after tare (range ±32 767 g) |
| flags | `uint8` | 1 | Bit 0 — stable (1 = reading settled); Bit 1 — calibrated (1 = scale factor set, 0 = uncalibrated); Bits 2–7 reserved |

**Total payload: 3 bytes** — fits well within the default 20-byte ATT value limit (BLE default MTU 23 − 3 header).

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
