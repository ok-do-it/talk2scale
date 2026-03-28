# Calibration flow

Describes the two-step scale calibration UI added to the Android app.

## Approach: overlay, not a separate Activity

The `BluetoothGatt` reference lives in `ScaleViewModel`, which is scoped to
`MainActivity`. A separate Activity would require refactoring BLE state into an
Application-scoped singleton or Service. An **overlay** (same pattern as the
existing connection overlay in `activity_main.xml`) keeps things simple and
consistent.

## User-facing flow

1. User taps the **calibrate** icon button in the top bar of the main scale
   screen.
2. A full-screen calibration overlay appears (covers the scale UI).
3. **Step 1 — Set Zero:** message instructs the user to remove everything from
   the scale, then press **SET ZERO**. The app sends BLE opcode `0x01` (tare).
4. **Step 2 — Set Calibration Weight:** message instructs the user to place a
   known weight on the scale, enter its mass in grams, and press
   **SET CALIBRATION WEIGHT**. The app sends BLE opcode `0x02` followed by a
   `uint16` LE reference mass.
5. The firmware computes `set_scale(raw_average / ref_mass)`, sets the
   `calibrated` flag, and immediately begins sending calibrated weight values.
   The `calibrated` bit (bit 1 in notify byte 4) flips to 1.
6. User presses the **close** button to dismiss the overlay and return to the
   main scale screen.

Calibration is **in-memory only** on the ESP32 — lost on power cycle.

## Files changed

### Layout: `activity_main.xml`

A third child inside the root `FrameLayout` (after the scale screen and
connection overlay) — a **calibration overlay** defaulting to `GONE`:

- **Close button** (top-right `ImageButton`, `ic_menu_close_clear_cancel`)
- **Title** "Calibrate Scale"
- **Step 1 text** + **Set Zero** button
- **Step 2 text** + **EditText** (`inputType="number"`, hint "Weight in grams")
  + **Set Calibration Weight** button

### Strings: `strings.xml`

| Resource | Value |
|----------|-------|
| `calib_title` | Calibrate Scale |
| `calib_step1` | 1. Remove everything from the scale and press Set Zero. |
| `btn_set_zero` | SET ZERO |
| `calib_step2` | 2. Place a known weight on the scale, enter it in grams below, and press Set Calibration Weight. |
| `hint_calib_grams` | Weight in grams |
| `btn_set_calib_weight` | SET CALIBRATION WEIGHT |
| `cd_close_calibration` | Close calibration |
| `toast_calib_zero_done` | Zero set |
| `toast_calib_no_weight` | Enter a weight in grams |
| `toast_calib_done` | Calibration sent |
| `toast_not_connected` | Scale not connected |

### ViewModel: `ScaleViewModel.java`

Add `sendCalibrate(int refMassGrams)` — mirrors `sendTare()`:

```java
@SuppressWarnings("MissingPermission")
public void sendCalibrate(int refMassGrams) {
    if (gatt == null) return;
    BluetoothGattService service = gatt.getService(SERVICE_UUID);
    if (service == null) return;
    BluetoothGattCharacteristic writeChar = service.getCharacteristic(WRITE_CHAR_UUID);
    if (writeChar == null) return;
    byte[] payload = new byte[3];
    payload[0] = 0x02;
    payload[1] = (byte) (refMassGrams & 0xFF);
    payload[2] = (byte) ((refMassGrams >> 8) & 0xFF);
    gatt.writeCharacteristic(writeChar, payload,
            BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
}
```

Also add `boolean isConnected()` for the Activity to guard button presses.

### Activity: `MainActivity.java`

- `bindViews()`: find calibration overlay views, wire:
  - `btnCalibrateTop` click → show calibration overlay (replaces current Toast)
  - Close button → hide calibration overlay
  - Set Zero → guard with `isConnected()`, call `viewModel.sendTare()`, toast
    "Zero set"
  - Set Calibration Weight → parse EditText, validate > 0, guard with
    `isConnected()`, call `viewModel.sendCalibrate(grams)`, toast "Calibration
    sent"

### ESP32 doc: `docs/esp32/description.md`

Add a **"Calibration procedure (from phone)"** section after "Write
characteristic (commands)", documenting:

- Two-step flow: (1) send TARE to zero, (2) place reference weight, send
  CALIBRATE with mass
- Firmware computes `set_scale(raw_average / ref_mass)` and sets `calibrated`
- The `calibrated` flag (bit 1 in notify byte 2) flips to 1
- In-memory only — lost on power cycle (already noted in "Not implemented")

No firmware code changes are needed — the existing `CmdCallbacks::onWrite` in
`ble.h` already handles both opcodes.
