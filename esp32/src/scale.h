#pragma once
#include <HX711.h>
#include <Preferences.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include <freertos/task.h>
#include "definitions.h"

HX711 scale;
bool calibrated = false;

volatile long latestRaw = 0;
long tareOffset = 0;
float scaleFactor = 1.0f;
Preferences scalePrefs;

SemaphoreHandle_t scaleMutex = nullptr;
TaskHandle_t scaleTaskHandle = nullptr;

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

void performTareLongAverage() {
  if (scaleTaskHandle) {
    vTaskSuspend(scaleTaskHandle);
  }
  long raw = scale.read_average(kTareAverageSamples);
  if (scaleTaskHandle) {
    vTaskResume(scaleTaskHandle);
  }
  xSemaphoreTake(scaleMutex, portMAX_DELAY);
  tareOffset = raw;
  latestRaw = raw;
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
  scale.read_average(10);  // warm up
  delay(kBootTareSettleMs);
  long raw = scale.read_average(kTareAverageSamples);
  tareOffset = raw;
  latestRaw = raw;
  xTaskCreate(scaleTask, "scale", 2048, nullptr, 2, &scaleTaskHandle);
  loadCalibration();
}
