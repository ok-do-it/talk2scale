# Run Mobile App on Android Emulator

Use this flow after completing [mobile setup](setup.md).

## Configure API URL

For Android emulator, `mobile/.env` should use the emulator host alias:

```bash
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8888
```

`10.0.2.2` points from the emulator back to the Mac host. Do not use it for a physical phone.

## Start Backend

From the repo root:

```bash
cd db
docker compose up -d

cd ../backend
npm run dev
```

Wait for the backend to report `Server ready` on port `8888`.

## First Install or Native Rebuild

Start an emulator, then build and install the dev client:

```bash
cd mobile
npm run android
```

This runs `expo run:android`. The first build can take a few minutes; later builds are incremental.

## Fast Restart

After the dev client is already installed, start Metro:

```bash
cd mobile
npx expo start --dev-client --clear
```

Then open the installed dev client in the emulator. If needed, open it explicitly:

```bash
adb shell am start -a android.intent.action.VIEW \
  -d "exp+talk2scale://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081" \
  dev.talk2scale
```

## Emulator Troubleshooting

List available emulators:

```bash
emulator -list-avds
```

If `Pixel_7` exits shortly after boot on macOS, try launching it with GPU disabled:

```bash
emulator -avd Pixel_7 -no-snapshot-load -no-snapshot-save -gpu off -no-audio -no-boot-anim -netfast
```

If `adb` still sees a stale emulator, restart the adb server:

```bash
adb kill-server
adb start-server
adb devices
```

If Metro bundles fail after dependency changes:

```bash
cd mobile
npx expo start --dev-client --clear
```
