# Run Mobile App on WiFi Android Phone

Use this flow after completing [mobile setup](setup.md).

## Configure API URL

A physical Android phone cannot use the emulator-only `10.0.2.2` host. Use the Mac's WiFi IP instead.

On macOS:

```bash
ipconfig getifaddr en0
```

If that prints `192.168.1.42`, set `mobile/.env` to:

```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.42:8888
```

Make sure the phone and Mac are on the same WiFi.

## Start Backend

From the repo root:

```bash
cd db
docker compose up -d

cd ../backend
npm run dev
```

Wait for the backend to report `Server ready` on port `8888`.

## Check Network Access

macOS firewall must allow inbound access to:

- `8888` for the backend
- `8081` for Metro

From the phone browser, open a backend URL using the Mac WiFi IP:

```text
http://192.168.1.42:8888/explore.html
```

If the phone cannot open it, fix WiFi/firewall/network access before debugging the app.

## Install Dev Client Over USB

Enable Android Developer Options and USB debugging on the phone. Connect the phone by USB and confirm it is visible:

```bash
adb devices
```

Then install the dev client:

```bash
cd mobile
npm run android
```

## Fast Restart

After the dev client is already installed, start Metro:

```bash
cd mobile
npx expo start --dev-client --clear
```

Open the dev client on the phone. If needed, use the Metro URL shown by Expo, or open it explicitly with the Mac WiFi IP:

```bash
adb shell am start -a android.intent.action.VIEW \
  -d "exp+talk2scale://expo-development-client/?url=http%3A%2F%2F192.168.1.42%3A8081" \
  dev.talk2scale
```

## Optional Wireless ADB

After one USB connection:

```bash
adb tcpip 5555
adb shell ip addr show wlan0
adb connect PHONE_WIFI_IP:5555
```

After wireless ADB is connected, USB is no longer required for launching commands, but the phone still needs network access to the backend and Metro on the Mac.
