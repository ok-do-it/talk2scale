#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLE2902.h>
#include <BLESecurity.h>
#include <Preferences.h>
#include <esp_gap_ble_api.h>
#include <HX711.h>
#include <cstring>
#include <cmath>

// docs/hardware/schematics.md — HX711 DT → GPIO4, SCK → GPIO16
constexpr uint8_t kHx711Dt = 4;
constexpr uint8_t kHx711Sck = 16;

// Hardware tare (see docs/hardware/README.md)
constexpr uint8_t kTareBtnPin = 15;

// Pair button — long press clears stored bond (see docs/hardware/README.md)
constexpr uint8_t kPairBtnPin = 13;
constexpr uint32_t kLongPressMs = 3000;

// Default scale factor until calibrated (see docs/hardware/README.md)
constexpr float kScaleFactor = 1.0f;

// Stability: consecutive readings within threshold (grams)
constexpr int kStableWindow = 5;
constexpr float kStableThreshold = 2.0f;

// BLE UUIDs (document in mobile app)
static const char* kServiceUuid = "4c78c001-8118-4aea-8f72-70ddbda3c9b9";
static const char* kNotifyCharUuid = "4c78c002-8118-4aea-8f72-70ddbda3c9b9";
static const char* kWriteCharUuid = "4c78c003-8118-4aea-8f72-70ddbda3c9b9";

// Write opcodes (docs/hardware/README.md)
constexpr uint8_t kCmdTare = 0x01;
constexpr uint8_t kCmdCalibrate = 0x02;

constexpr uint8_t kFlagStable = 0x01;
constexpr uint8_t kFlagCalibrated = 0x02;

HX711 scale;
BLEServer* bleServer = nullptr;
BLECharacteristic* notifyChar = nullptr;

Preferences prefs;
bool hasBond = false;

volatile bool deviceConnected = false;
bool calibrated = false;

int stableCount = 0;
float lastWeightForStable = 0.0f;

bool prevTareDown = false;
uint32_t lastTarePressMs = 0;
constexpr uint32_t kTareCooldownMs = 300;

bool prevPairDown = false;
uint32_t pairDownSince = 0;
bool pairLongHandled = false;

bool updateStable(float w) {
  if (std::fabs(w - lastWeightForStable) < kStableThreshold) {
    stableCount = std::min(stableCount + 1, kStableWindow);
  } else {
    stableCount = 0;
  }
  lastWeightForStable = w;
  return stableCount >= kStableWindow;
}

void startAdvertising() {
  BLEAdvertising* adv = bleServer->getAdvertising();
  adv->addServiceUUID(kServiceUuid);
  adv->setScanResponse(true);
  adv->setMinPreferred(0x06);
  adv->setMaxPreferred(0x12);
  adv->start();
}

void clearBond() {
  int count = esp_ble_get_bond_device_num();
  if (count > 0) {
    esp_ble_bond_dev_t* devList =
        static_cast<esp_ble_bond_dev_t*>(malloc(count * sizeof(esp_ble_bond_dev_t)));
    if (devList) {
      esp_ble_get_bond_device_list(&count, devList);
      for (int i = 0; i < count; ++i) {
        esp_ble_remove_bond_device(devList[i].bd_addr);
      }
      free(devList);
    }
  }
  prefs.putBool("bonded", false);
  hasBond = false;
  startAdvertising();
  Serial.println(F("BLE: bond cleared, open advertising"));
}

class SecurityCB : public BLESecurityCallbacks {
  uint32_t onPassKeyRequest() override { return 0; }
  void onPassKeyNotify(uint32_t) override {}
  bool onConfirmPIN(uint32_t) override { return true; }
  bool onSecurityRequest() override { return true; }

  void onAuthenticationComplete(esp_ble_auth_cmpl_t cmpl) override {
    if (cmpl.success) {
      prefs.putBool("bonded", true);
      hasBond = true;
      Serial.println(F("BLE: bonding complete, stored in NVS"));
    } else {
      Serial.print(F("BLE: bonding failed, reason=0x"));
      Serial.println(cmpl.fail_reason, HEX);
    }
  }
};

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* /*p*/) override {
    deviceConnected = true;
    Serial.println(F("BLE: client connected (advertising stopped)"));
  }

  void onDisconnect(BLEServer* /*p*/) override {
    deviceConnected = false;
    startAdvertising();
    Serial.println(F("BLE: client disconnected; advertising resumed"));
  }
};

class CmdCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* characteristic) override {
    std::string value = characteristic->getValue();
    if (value.empty()) {
      return;
    }
    const uint8_t* data = reinterpret_cast<const uint8_t*>(value.data());
    size_t len = value.length();

    switch (data[0]) {
      case kCmdTare:
        scale.tare(15);
        stableCount = 0;
        Serial.println(F("BLE: TARE"));
        break;

      case kCmdCalibrate:
        if (len < 3) {
          Serial.println(F("BLE: CALIBRATE payload too short"));
          break;
        }
        {
          uint16_t refMassG = static_cast<uint16_t>(data[1]) |
                              (static_cast<uint16_t>(data[2]) << 8);
          if (refMassG == 0) {
            Serial.println(F("BLE: CALIBRATE ref mass is zero"));
            break;
          }
          long avg = scale.read_average(20);
          if (avg == 0) {
            Serial.println(F("BLE: CALIBRATE average is zero"));
            break;
          }
          scale.set_scale(static_cast<float>(avg) / static_cast<float>(refMassG));
          calibrated = true;
          Serial.print(F("BLE: CALIBRATE scale set, ref g="));
          Serial.println(refMassG);
        }
        break;

      default:
        Serial.print(F("BLE: unknown opcode 0x"));
        Serial.println(data[0], HEX);
        break;
    }
  }
};

void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(kTareBtnPin, INPUT_PULLUP);
  pinMode(kPairBtnPin, INPUT_PULLUP);

  scale.begin(kHx711Dt, kHx711Sck);
  scale.set_scale(kScaleFactor);
  scale.tare(15);

  calibrated = (kScaleFactor != 1.0f);

  prefs.begin("ble", false);
  hasBond = prefs.getBool("bonded", false);

  BLEDevice::init("TalkToScale");
  BLEDevice::setEncryptionLevel(ESP_BLE_SEC_ENCRYPT);
  BLEDevice::setSecurityCallbacks(new SecurityCB());

  BLESecurity* sec = new BLESecurity();
  sec->setAuthenticationMode(ESP_LE_AUTH_REQ_SC_BOND);
  sec->setCapability(ESP_IO_CAP_NONE);
  sec->setInitEncryptionKey(ESP_BLE_ENC_KEY_MASK | ESP_BLE_ID_KEY_MASK);

  bleServer = BLEDevice::createServer();
  bleServer->setCallbacks(new ServerCallbacks());

  BLEService* service = bleServer->createService(kServiceUuid);

  notifyChar = service->createCharacteristic(
      kNotifyCharUuid,
      BLECharacteristic::PROPERTY_NOTIFY);
  notifyChar->setAccessPermissions(ESP_GATT_PERM_READ_ENCRYPTED);
  notifyChar->addDescriptor(new BLE2902());

  BLECharacteristic* writeChar = service->createCharacteristic(
      kWriteCharUuid,
      BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  writeChar->setAccessPermissions(ESP_GATT_PERM_WRITE_ENCRYPTED);
  writeChar->setCallbacks(new CmdCallbacks());

  service->start();
  startAdvertising();

  Serial.print(F("TalkToScale: HX711 + BLE ready; "));
  Serial.println(hasBond ? F("bonded device in NVS, advertising.")
                         : F("no bond, open advertising."));
}

void loop() {
  uint32_t now = millis();

  // Tare button: falling edge + cooldown
  bool tareDown = digitalRead(kTareBtnPin) == LOW;
  if (tareDown && !prevTareDown && (now - lastTarePressMs) >= kTareCooldownMs) {
    lastTarePressMs = now;
    scale.tare(15);
    stableCount = 0;
    Serial.println(F("Hardware TARE (GPIO15)"));
  }
  prevTareDown = tareDown;

  // Pair button: long press (>=3 s) clears stored bond
  bool pairDown = digitalRead(kPairBtnPin) == LOW;
  if (pairDown && !prevPairDown) {
    pairDownSince = now;
    pairLongHandled = false;
  } else if (pairDown && !pairLongHandled &&
             (now - pairDownSince) >= kLongPressMs) {
    pairLongHandled = true;
    clearBond();
  }
  prevPairDown = pairDown;

  float weight = scale.get_units(10);
  bool stable = updateStable(weight);

  int32_t wg = static_cast<int32_t>(lroundf(weight));
  if (wg > 32767) {
    wg = 32767;
  }
  if (wg < -32768) {
    wg = -32768;
  }

  uint8_t payload[3];
  int16_t w16 = static_cast<int16_t>(wg);
  std::memcpy(payload, &w16, sizeof(w16));
  payload[2] = (stable ? kFlagStable : 0) | (calibrated ? kFlagCalibrated : 0);

  if (deviceConnected && notifyChar) {
    notifyChar->setValue(payload, sizeof(payload));
    notifyChar->notify();
  }

  Serial.print(F("Weight: "));
  Serial.print(weight, 2);
  if (!calibrated) {
    Serial.print(F(" (uncalibrated)"));
  }
  Serial.print(stable ? F(" stable") : F(" settling"));
  Serial.println();

  delay(200);
}
