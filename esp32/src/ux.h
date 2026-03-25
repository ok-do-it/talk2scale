#pragma once
#include <Arduino.h>
#include "definitions.h"
#include "scale.h"
#include "ble.h"

// --- Button state -----------------------------------------------------------

bool prevTareDown = false;
uint32_t lastTarePressMs = 0;

bool prevPairDown = false;
uint32_t pairDownSince = 0;
bool pairLongHandled = false;

void pollTareButton(uint32_t now) {
  bool tareDown = digitalRead(kTareBtnPin) == LOW;
  if (tareDown && !prevTareDown && (now - lastTarePressMs) >= kTareCooldownMs) {
    lastTarePressMs = now;
    scale.tare(15);
    stableCount = 0;
    Serial.println(F("Hardware TARE (GPIO15)"));
  }
  prevTareDown = tareDown;
}

void pollPairButton(uint32_t now) {
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
}

// --- LED status task --------------------------------------------------------

void ledTask(void* /*param*/) {
  pinMode(kLedPin, OUTPUT);
  for (;;) {
    if (deviceConnected) {
      digitalWrite(kLedPin, HIGH);
      vTaskDelay(pdMS_TO_TICKS(100));
    } else {
      digitalWrite(kLedPin, HIGH);
      vTaskDelay(pdMS_TO_TICKS(kLedBlinkMs));
      digitalWrite(kLedPin, LOW);
      vTaskDelay(pdMS_TO_TICKS(kLedBlinkMs));
    }
  }
}

// --- Setup ------------------------------------------------------------------

void setupUX() {
  pinMode(kTareBtnPin, INPUT_PULLUP);
  pinMode(kPairBtnPin, INPUT_PULLUP);
  xTaskCreate(ledTask, "led", 1024, nullptr, 1, nullptr);
}
