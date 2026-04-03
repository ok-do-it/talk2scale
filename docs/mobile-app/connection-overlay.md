# Connection overlay

Full-screen overlay that manages BLE connection lifecycle. Controlled by
`ConnectionOverlayController`; visibility is driven by explicit calls
(`showOverlay()` / `hideOverlay()` on `ScaleViewModel`) — the overlay never
auto-closes.

See [design.md](design.md) for the broader BLE stack, permissions, and
threading model.

## Layout

```
┌──────────────────────────┐
│                          │
│      (Bluetooth icon)    │
│                          │
│   Searching for scale…   │  ← status text
│      ◌  (spinner)        │
│                          │
│      [ CONNECT ]         │
│      [ DISCONNECT ]      │
│   [ FORGET ALL DEVICES ] │
│      [ CLOSE ]           │
│                          │
└──────────────────────────┘
```

**Layout file:** [`view_connection_overlay.xml`](../../android/app/src/main/res/layout/view_connection_overlay.xml)

## Status text

| Condition | Text |
|-----------|------|
| CDM search active (no stored MAC) | "Searching for scale…" |
| Reconnecting to stored MAC | "Reconnecting…" |
| Connected | "Connected" |
| Permission denied | "Bluetooth permission denied" |

The progress spinner is visible only during "Searching…" and "Reconnecting…".

## Button states

| State | Connect | Disconnect | Forget All | Close |
|-------|---------|------------|------------|-------|
| Disconnected, idle | enabled | disabled | enabled | enabled |
| Searching / Connecting / Reconnecting | disabled | disabled | disabled | enabled (cancels) |
| Connected | disabled | enabled | enabled | enabled |

### Button actions

- **Connect** — calls `startConnectionFlow()`: requests `BLUETOOTH_CONNECT`
  permission if needed, then either reconnects via stored MAC or starts a CDM
  association.
- **Disconnect** — closes the GATT connection, re-enables mock transport, and
  hides the overlay.
- **Forget All Devices** — removes the stored MAC from `SharedPreferences`.
  Does not disconnect an active connection.
- **Close** — hides the overlay. If a connection attempt is in progress, it is
  cancelled first (`bleTransport.close()`, `realConnectionRequested` reset).

## Behavior

### Opening the overlay

`MainActivity` binds the top Bluetooth `ImageButton` to
`connectionOverlay.show()`, which decides:

- **Already connected** — shows the overlay with "Connected" status so the
  user can disconnect or forget.
- **Not connected** — calls `startConnectionFlow()` to begin pairing /
  reconnecting and shows the overlay with the appropriate searching or
  reconnecting status.

### Closing the overlay

The overlay is **never** closed by a LiveData observer. The user must
explicitly tap **Close** or **Disconnect**. This prevents the overlay from
vanishing unexpectedly during transient state changes.

## Connection flow

```
connectionOverlay.show()
  │
  ├─ Already connected?
  │   └─ YES → show overlay with "Connected" status, done
  │
  └─ NO → startConnectionFlow()
       │
       ├─ BLUETOOTH_CONNECT permission granted?
       │   └─ NO → request via ActivityResultLauncher
       │           ├─ granted → beginConnection()
       │           └─ denied  → show "Bluetooth permission denied"
       │
       └─ beginConnection()
           │
           ├─ Stored MAC exists?
           │   ├─ YES → "Reconnecting…"
           │   │         BluetoothAdapter.getRemoteDevice(mac)
           │   │         connectGatt(ctx, autoConnect=true, gattCallback)
           │   │
           │   └─ NO  → "Searching for scale…"
           │            CompanionDeviceManager.associate()
           │            → system bottom-sheet → user taps device
           │            → ActivityResultLauncher callback
           │            → connectGatt, store MAC
           │
           └─ onConnectionStateChange(STATE_CONNECTED)
               → discoverServices → subscribe to notifications
               → status updates to "Connected"
               → user closes overlay manually
```

### First connection (CompanionDeviceManager)

1. Build an `AssociationRequest` with a `BluetoothLeDeviceFilter` whose
   `ScanFilter` matches the service UUID. `setSingleDevice(true)` auto-selects
   when exactly one device matches.
2. `CompanionDeviceManager.Callback.onDeviceFound` wraps the `IntentSender` in
   an `IntentSenderRequest` launched via `ActivityResultLauncher`.
3. The result callback extracts the `BluetoothDevice` from
   `CompanionDeviceManager.EXTRA_DEVICE`, calls `connectGatt()`, and stores
   the MAC in `SharedPreferences`.

### Reconnection (stored MAC)

On `show()` when not connected and a MAC is stored,
`BluetoothAdapter.getRemoteDevice(mac).connectGatt(ctx, true, gattCallback)`
is called. `autoConnect=true` tells Android to passively wait for the
peripheral and connect when seen — low power, no active scan.

### Disconnect / power cycle

When the BLE connection drops (scale powered off, out of range), the
`connectionState` LiveData updates to `STATE_DISCONNECTED`. The overlay does
**not** reappear automatically — the user re-opens it via the top Bluetooth
button.

## Source files

| File | Role |
|------|------|
| [`ConnectionOverlayController.java`](../../android/app/src/main/java/dev/talk2scale/ConnectionOverlayController.java) | View binding, button handlers, CDM association, MAC storage |
| [`ScaleViewModel.java`](../../android/app/src/main/java/dev/talk2scale/ScaleViewModel.java) | `showOverlay()` / `hideOverlay()`, `disconnect()`, `cancelConnection()`, `isConnectionInProgress()` |
| [`view_connection_overlay.xml`](../../android/app/src/main/res/layout/view_connection_overlay.xml) | Layout (icon, status, spinner, 4 buttons) |
| [`MainActivity.java`](../../android/app/src/main/java/dev/talk2scale/MainActivity.java) | Wires top Bluetooth button to `connectionOverlay.show()` |
