# Mobile app design

The active mobile app is the React Native / Expo app in `mobile/`.

## Project setup

| Item | Value |
|------|-------|
| Runtime | React Native 0.81 with Expo dev client |
| Entry point | `mobile/App.tsx` |
| Navigation | `mobile/src/navigation/RootStack.tsx` |
| State | Zustand store in `mobile/src/state/scaleStore.ts` |
| BLE transport | `react-native-ble-plx` in `mobile/src/transport/BleScaleTransport.ts` |
| Voice capture | `expo-audio` recorder in `mobile/src/services/voiceRecording.ts` |

## BLE identifiers

Shared identifiers live in `mobile/src/constants/ble.ts`.

| Item | UUID |
|------|------|
| Service | `4c78c001-8118-4aea-8f72-70ddbda3c9b9` |
| Notify (weight) | `4c78c002-8118-4aea-8f72-70ddbda3c9b9` |
| Write (commands) | `4c78c003-8118-4aea-8f72-70ddbda3c9b9` |

## App flow

`App.tsx` initializes the scale store on mount and tears transports down on unmount. The store wires both the BLE transport and mock transport behind the same listener shape.

- With a stored device id, initialization attempts a reconnect.
- Without a real connection, mock mode can publish local weights for development.
- Real BLE weight notifications update the shared weight reading and disable mock mode.

## Connection flow

The connection UI is a React Navigation screen documented in [`connection-overlay.md`](connection-overlay.md). It requests Bluetooth permission, reconnects to a stored device when available, otherwise scans for the scale and lets the user select a discovered device.

The BLE transport connects, discovers services and characteristics, subscribes to the notify characteristic, and stores the selected device id for future reconnects.

## Weight notifications

Firmware pushes a 4-byte notification every ~333 ms as soon as a client is connected and subscribed.

| Offset | Type | Content |
|--------|------|---------|
| 0-3 | `int32` LE | Weight in grams, signed |

`mobile/src/transport/bleCodec.ts` decodes the notification payload from base64 into a gram value. The store marks readings stable when the same gram value repeats across the configured stability window.

## Commands

Commands are fire-and-forget writes mapped to UI actions.

| Command | Opcode | Payload | Trigger |
|---------|--------|---------|---------|
| Tare | `0x01` | none | Tare button |
| Calibrate | `0x02` | `uint16` LE reference mass in grams | Calibration modal |

`BleScaleTransport` writes encoded command payloads to the write characteristic. Mock mode implements tare locally and ignores calibration.

## Calibration

The calibration flow is implemented as a React Native modal in `mobile/src/components/CalibrationOverlay.tsx`. See [`calibration-flow.md`](calibration-flow.md) for the user flow and command details.

## Speech-to-text

The React Native app records short audio clips with `expo-audio`. `mobile/src/services/speech.ts` sends the clip to the backend voice API and receives the transcribed text.

The current flow is push-to-record:

1. Request microphone permission.
2. Record up to the configured max duration.
3. Upload the audio file to the backend.
4. Use the resolved food name in the dashboard scale carousel or Create Recipe screen.

## Persistence

Device identity and the selected user id are stored through `mobile/src/services/storage.ts`. Food logs persist immediately through the backend API. The dashboard shows today's food logs in a shared list under a two-page Nutrition/Scale carousel; nearby timestamps are clustered client-side (30 minutes). Recipes are drafted locally and saved atomically with `POST /recipes`.
