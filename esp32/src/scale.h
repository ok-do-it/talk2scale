#pragma once
#include <HX711.h>
#include <cmath>
#include "definitions.h"

HX711 scale;
bool calibrated = false;

int stableCount = 0;
float lastWeightForStable = 0.0f;

bool updateStable(float w) {
  if (std::fabs(w - lastWeightForStable) < kStableThreshold) {
    stableCount = std::min(stableCount + 1, kStableWindow);
  } else {
    stableCount = 0;
  }
  lastWeightForStable = w;
  return stableCount >= kStableWindow;
}

void performTare() {
  scale.tare(50);
  stableCount = 0;
  lastWeightForStable = 0.0f;
}

void setupScale() {
  scale.begin(kHx711Dt, kHx711Sck);
  scale.set_scale(kScaleFactor);
  performTare();
  calibrated = (kScaleFactor != 1.0f);
}
