#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLE2902.h>
#include <HX711.h>
#include <cstring>
#include <cmath>

// docs/hardware/schematics.md — HX711 DT → GPIO4, SCK → GPIO16
constexpr uint8_t kHx711Dt = 4;
constexpr uint8_t kHx711Sck = 16;

// Hardware tare (see docs/hardware/README.md)
constexpr uint8_t kTareBtnPin = 15;

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

volatile bool deviceConnected = false;
bool calibrated = false;

int stableCount = 0;
float lastWeightForStable = 0.0f;

bool prevTareDown = false;
uint32_t lastTarePressMs = 0;
constexpr uint32_t kTareCooldownMs = 300;

bool updateStable(float w) {
  if (std::fabs(w - lastWeightForStable) < kStableThreshold) {
    stableCount = std::min(stableCount + 1, kStableWindow);
  } else {
    stableCount = 0;
  }
  lastWeightForStable = w;
  return stableCount >= kStableWindow;
}

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* /*p*/) override {
    deviceConnected = true;
    Serial.println(F("BLE: client connected (advertising stopped)"));
  }

  void onDisconnect(BLEServer* p) override {
    deviceConnected = false;
    p->getAdvertising()->start();
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

  scale.begin(kHx711Dt, kHx711Sck);
  scale.set_scale(kScaleFactor);
  scale.tare(15);

  calibrated = (kScaleFactor != 1.0f);

  BLEDevice::init("TalkToScale");
  bleServer = BLEDevice::createServer();
  bleServer->setCallbacks(new ServerCallbacks());

  BLEService* service = bleServer->createService(kServiceUuid);

  notifyChar = service->createCharacteristic(
      kNotifyCharUuid,
      BLECharacteristic::PROPERTY_NOTIFY);
  notifyChar->addDescriptor(new BLE2902());

  BLECharacteristic* writeChar = service->createCharacteristic(
      kWriteCharUuid,
      BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  writeChar->setCallbacks(new CmdCallbacks());

  service->start();

  BLEAdvertising* adv = bleServer->getAdvertising();
  adv->addServiceUUID(kServiceUuid);
  adv->setScanResponse(true);
  adv->setMinPreferred(0x06);
  adv->setMaxPreferred(0x12);
  adv->start();

  Serial.println(F("TalkToScale: HX711 + BLE ready; advertising (connect from app)."));
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
