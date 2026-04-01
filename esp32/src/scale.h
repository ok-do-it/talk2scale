#pragma once
#include <HX711.h>
#include <Preferences.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include "definitions.h"

HX711 scale;
bool calibrated = false;

volatile long latestRaw = 0;
long tareOffset = 0;
float scaleFactor = 1.0f;
Preferences scalePrefs;

SemaphoreHandle_t scaleMutex = nullptr;
constexpr const char* kScalePrefsNamespace = "scale";
constexpr const char* kScaleFactorKey = "factor";

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

void performTare() {
  xSemaphoreTake(scaleMutex, portMAX_DELAY);
  tareOffset = latestRaw;
  xSemaphoreGive(scaleMutex);
}

void saveCalibration() {
  xSemaphoreTake(scaleMutex, portMAX_DELAY);
  float factor = scaleFactor;
  xSemaphoreGive(scaleMutex);

  if (!scalePrefs.begin(kScalePrefsNamespace, false)) {
    LOG(F("Scale: failed to open NVS for calibration write"));
    return;
  }
  scalePrefs.putFloat(kScaleFactorKey, factor);
  scalePrefs.end();
}

void loadCalibration() {
  if (!scalePrefs.begin(kScalePrefsNamespace, true)) {
    LOG(F("Scale: failed to open NVS for calibration read"));
    return;
  }
  float savedFactor = scalePrefs.getFloat(kScaleFactorKey, kScaleFactor);
  scalePrefs.end();
  if (savedFactor <= 0.0f || savedFactor == kScaleFactor) {
    return;
  }

  xSemaphoreTake(scaleMutex, portMAX_DELAY);
  scaleFactor = savedFactor;
  calibrated = true;
  xSemaphoreGive(scaleMutex);
  LOG(F("Scale: loaded calibration factor from NVS"));
}

void setupScale() {
  scaleMutex = xSemaphoreCreateMutex();
  scale.begin(kHx711Dt, kHx711Sck);
  scale.read_average(10); // warm up
  xTaskCreate(scaleTask, "scale", 2048, nullptr, 2, nullptr);
  delay(400); // let task get first reading
  performTare();
  loadCalibration();
}
