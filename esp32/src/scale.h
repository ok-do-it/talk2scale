#pragma once
#include <HX711.h>
#include <cmath>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include "definitions.h"

HX711 scale;
bool calibrated = false;

volatile long latestRaw = 0;
long tareOffset = 0;
float scaleFactor = 1.0f;

int stableCount = 0;
long lastRawForStable = 0;

SemaphoreHandle_t scaleMutex = nullptr;

void scaleTask(void*) {
  for (;;) {
    long raw = scale.read_average(3);
    xSemaphoreTake(scaleMutex, portMAX_DELAY);
    latestRaw = raw;
    xSemaphoreGive(scaleMutex);
    vTaskDelay(10);
  }
}

float getWeight() {
  xSemaphoreTake(scaleMutex, portMAX_DELAY);
  long raw = latestRaw;
  long offset = tareOffset;
  float factor = scaleFactor;
  xSemaphoreGive(scaleMutex);
  return static_cast<float>(raw - offset) / factor;
}

bool updateStable() {
  xSemaphoreTake(scaleMutex, portMAX_DELAY);
  long raw = latestRaw;
  xSemaphoreGive(scaleMutex);
  if (std::abs(raw - lastRawForStable) < kStableThreshold) {
    stableCount = std::min(stableCount + 1, kStableWindow);
  } else {
    stableCount = 0;
  }
  lastRawForStable = raw;
  return stableCount >= kStableWindow;
}

void performTare() {
  xSemaphoreTake(scaleMutex, portMAX_DELAY);
  tareOffset = latestRaw;
  xSemaphoreGive(scaleMutex);
  stableCount = 0;
  lastRawForStable = 0;
}

void setupScale() {
  scaleMutex = xSemaphoreCreateMutex();
  scale.begin(kHx711Dt, kHx711Sck);
  scale.read_average(10); // warm up
  xTaskCreate(scaleTask, "scale", 2048, nullptr, 2, nullptr);
  delay(400); // let task get first reading
  performTare();
}
