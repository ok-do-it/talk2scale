#pragma once
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLE2902.h>
#include <BLESecurity.h>
#include <Preferences.h>
#include <esp_gap_ble_api.h>
#include "definitions.h"
#include "scale.h"

BLEServer* bleServer = nullptr;
BLECharacteristic* notifyChar = nullptr;

Preferences prefs;
bool hasBond = false;

volatile bool deviceConnected = false;

// ---------------------------------------------------------------------------

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
  LOG(F("BLE: bond cleared, open advertising"));
}

// ---------------------------------------------------------------------------

class SecurityCB : public BLESecurityCallbacks {
  uint32_t onPassKeyRequest() override { return 0; }
  void onPassKeyNotify(uint32_t) override {}
  bool onConfirmPIN(uint32_t) override { return true; }
  bool onSecurityRequest() override { return true; }

  void onAuthenticationComplete(esp_ble_auth_cmpl_t cmpl) override {
    if (cmpl.success) {
      prefs.putBool("bonded", true);
      hasBond = true;
      LOG(F("BLE: bonding complete, stored in NVS"));
    } else {
      LOG_PRINT(F("BLE: bonding failed, reason=0x"));
      LOG(cmpl.fail_reason, HEX);
    }
  }
};

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* /*p*/) override {
    deviceConnected = true;
    LOG(F("BLE: client connected (advertising stopped)"));
  }

  void onDisconnect(BLEServer* /*p*/) override {
    deviceConnected = false;
    startAdvertising();
    LOG(F("BLE: client disconnected; advertising resumed"));
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
        delay(1000);
        performTare();
        LOG(F("BLE: TARE"));
        break;

      case kCmdCalibrate:
        if (len < 3) {
          LOG(F("BLE: CALIBRATE payload too short"));
          break;
        }
        {
          uint16_t refMassG = static_cast<uint16_t>(data[1]) |
                              (static_cast<uint16_t>(data[2]) << 8);
          if (refMassG == 0) {
            LOG(F("BLE: CALIBRATE ref mass is zero"));
            break;
          }
          xSemaphoreTake(scaleMutex, portMAX_DELAY);
          long avg = latestRaw - tareOffset;
          xSemaphoreGive(scaleMutex);
          if (avg == 0) {
            LOG(F("BLE: CALIBRATE average is zero"));
            break;
          }
          scaleFactor = static_cast<float>(avg) / static_cast<float>(refMassG);
          calibrated = true;
          saveCalibration();
          LOG_PRINT(F("BLE: CALIBRATE scale set, ref g="));
          LOG(refMassG);
          LOG(F("BLE: CALIBRATE scale factor stored in NVS"));
        }
        break;

      default:
        LOG_PRINT(F("BLE: unknown opcode 0x"));
        LOG(data[0], HEX);
        break;
    }
  }
};

// ---------------------------------------------------------------------------

void setupBLE() {
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

  LOG_PRINT(F("TalkToScale: HX711 + BLE ready; "));
  LOG(hasBond ? F("bonded device in NVS, advertising.")
                         : F("no bond, open advertising."));
}
