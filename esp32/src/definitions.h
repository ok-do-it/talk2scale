#pragma once
#include <cstdint>

// docs/hardware/schematics.md — HX711 DT → GPIO4, SCK → GPIO16
constexpr uint8_t kHx711Dt = 4;
constexpr uint8_t kHx711Sck = 16;

// Default scale factor until calibrated (see docs/hardware/README.md)
constexpr float kScaleFactor = 1.0f;

// Stability: consecutive readings within threshold (grams)
constexpr int kStableWindow = 5;
constexpr long kStableThreshold = 300L;

// BLE UUIDs (document in mobile app)
static const char* kServiceUuid = "4c78c001-8118-4aea-8f72-70ddbda3c9b9";
static const char* kNotifyCharUuid = "4c78c002-8118-4aea-8f72-70ddbda3c9b9";
static const char* kWriteCharUuid = "4c78c003-8118-4aea-8f72-70ddbda3c9b9";

// Write opcodes (docs/hardware/README.md)
constexpr uint8_t kCmdTare = 0x01;
constexpr uint8_t kCmdCalibrate = 0x02;

