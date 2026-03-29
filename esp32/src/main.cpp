#include <Arduino.h>
#include <cstring>

#include "definitions.h"
#include "scale.h"
#include "ble.h"
#include "ux.h"

void setup() {
  Serial.begin(115200);
  delay(500);
  setupUX();
  setupScale();
  setupBLE();
}

static uint32_t lastNotifyMs = 0;
static uint32_t lastPrintMs = 0;

void loop() {
  uint32_t now = millis();
  pollTareButton(now);
  pollPairButton(now);

  float weight = getWeight();
  bool stable = updateStable();

  if (now - lastNotifyMs >= 333) {
    lastNotifyMs = now;
    int32_t wg = static_cast<int32_t>(lroundf(weight));

    uint8_t payload[5];
    std::memcpy(payload, &wg, sizeof(wg));
    payload[4] = (stable ? kFlagStable : 0) | (calibrated ? kFlagCalibrated : 0);

    if (deviceConnected && notifyChar) {
      notifyChar->setValue(payload, sizeof(payload));
      notifyChar->notify();
    }
  }

  if (now - lastPrintMs >= 1000) {
    lastPrintMs = now;
    Serial.print(F("Weight: "));
    Serial.print(weight, 2);
    if (calibrated) {
      Serial.print(F(" g"));
    }
    Serial.print(stable ? F(" stable") : F(" ~ "));
    Serial.println();
  }

  delay(10);
}
