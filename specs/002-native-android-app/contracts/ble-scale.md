# Contract: Scale Bluetooth protocol

Binding and unchanged (FR-003, FR-005). Source of truth: [docs/mobile-app/design.md](../../../docs/mobile-app/design.md) and the legacy React Native transport in `mobile-rn/src/transport/`.

## Identifiers

| Item | Value |
|------|-------|
| Advertised name | `TalkToScale` |
| Service | `4c78c001-8118-4aea-8f72-70ddbda3c9b9` |
| Notify (weight) | `4c78c002-8118-4aea-8f72-70ddbda3c9b9` |
| Write (commands) | `4c78c003-8118-4aea-8f72-70ddbda3c9b9` |

A scan result is the scale when it advertises the service UUID or the name `TalkToScale`.

## Weight notification

About every 333 ms after notifications are enabled.

| Offset | Type | Content |
|--------|------|---------|
| 0–3 | `int32` little-endian | Weight in grams, signed |

Payloads shorter than 4 bytes are ignored. Android delivers raw bytes, so there is no base64 step.

## Commands

Written with response to the write characteristic. Failures are ignored, as today.

| Command | Bytes |
|---------|-------|
| Tare | `01` |
| Calibrate | `02 lo hi` (reference grams as `uint16` little-endian) |

## Connection sequence

1. Stop scanning.
2. `connectGatt(autoConnect = true)` for a stored device on start, `false` for a device picked from the scan.
3. Discover services.
4. Enable notifications on the notify characteristic (set notification and write the CCCD descriptor `0x2902` = `01 00`).
5. Report `Connected`, then save the device address as `scale_mac`.

Link loss reports `Disconnected` and the last weight stops being live.

## Permissions

`BLUETOOTH_SCAN` (with `neverForLocation`) and `BLUETOOTH_CONNECT` at runtime.
