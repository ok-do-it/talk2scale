# Calibration flow

The active calibration UI is the React Native modal in `mobile/src/components/CalibrationOverlay.tsx`.

## User-facing flow

1. The user opens calibration from the scale screen.
2. The modal asks the user to remove everything from the scale.
3. Pressing **SET ZERO** sends BLE opcode `0x01` (tare).
4. The user places a known weight on the scale, enters its mass in grams, and presses **SET CALIBRATION WEIGHT**.
5. The app sends BLE opcode `0x02` followed by a `uint16` little-endian reference mass.
6. The firmware computes the calibration factor and immediately begins sending calibrated weight values.

Calibration is in-memory only on the ESP32 and is lost on power cycle.

## Implementation

`CalibrationOverlay` reads connection state and command actions from `useScaleStore`.

- `sendTare()` is available in both real and mock scale modes.
- `sendCalibrate(refMassGrams)` only writes to the real BLE transport when connected.
- The modal blocks empty, non-numeric, or non-positive reference weights.

## BLE payloads

| Command | Payload |
|---------|---------|
| Tare | `0x01` |
| Calibrate | `0x02`, low byte of grams, high byte of grams |

Encoding lives in `mobile/src/transport/bleCodec.ts`; transport writes live in `mobile/src/transport/BleScaleTransport.ts`.
