# Connection screen

The active connection UI is the React Native screen in `mobile/src/screens/ConnectionScreen.tsx`. It replaces the retired full-screen native overlay and owns the user-facing BLE connection lifecycle.

See [`design.md`](design.md) for the broader BLE transport, command, and notification model.

## Screen behavior

`ConnectionScreen` can be opened manually or with `autoStartConnect` from navigation params.

- If already connected, it shows **Connected** and lets the user disconnect or forget the stored device.
- If a stored device id exists, it attempts a reconnect with `autoConnect=true`.
- If no stored device exists, it scans for nearby scale devices and shows discovered matches in a list.
- Leaving the screen while a connection is in progress cancels the scan or pending connection attempt.

## Status text

| Condition | Text |
|-----------|------|
| Scan active | "Searching for scale..." |
| Stored device reconnect | "Reconnecting..." |
| Device list available | "Select scale" |
| Connected | "Connected" |
| Permission denied | "Bluetooth permission denied" |
| Failed connection attempt | "Connection failed" |

The progress spinner is visible during scan, reconnect, and direct connection attempts.

## Button states

| State | Connect | Disconnect | Forget All | Back / Cancel |
|-------|---------|------------|------------|---------------|
| Disconnected, idle | enabled | disabled | enabled | Back |
| Searching / Connecting / Reconnecting | disabled | disabled | disabled | Cancel |
| Connected | disabled | enabled | enabled | Back |

## Connection flow

```text
ConnectionScreen opens
  |
  |-- connected?
  |     `-- yes -> show Connected
  |
  `-- user starts connection
        |
        |-- Bluetooth permission granted?
        |     `-- no -> show permission denied
        |
        |-- stored device id exists?
        |     `-- yes -> reconnect with autoConnect=true
        |
        `-- no -> scan for scale devices
              -> user selects a device
              -> connect, discover services, subscribe to notifications
              -> store device id
```

## Source files

| File | Role |
|------|------|
| `mobile/src/screens/ConnectionScreen.tsx` | User interface, button handlers, scan result list |
| `mobile/src/transport/BleScaleTransport.ts` | BLE scanning, connection, service discovery, notifications, writes |
| `mobile/src/state/scaleStore.ts` | Connection state, stored-device actions, mock mode switching |
| `mobile/src/services/permissions.ts` | Bluetooth permission request |
| `mobile/src/services/storage.ts` | Stored device id persistence |
