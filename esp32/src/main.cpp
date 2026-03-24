#include <Arduino.h>
#include <HX711.h>

// docs/hardware/schematics.md §1.4 — HX711 DT → GPIO4, SCK → GPIO16
constexpr uint8_t kHx711Dt = 4;
constexpr uint8_t kHx711Sck = 16;

// After tare: divide raw reading by known mass (g) to get this factor, then call set_scale().
// Example: reading 12345 for 500 g → scale factor ≈ 12345 / 500 = 24.69
constexpr float kScaleFactor = 1.0f;

HX711 scale;

void setup() {
  Serial.begin(115200);
  delay(500);

  scale.begin(kHx711Dt, kHx711Sck);
  scale.set_scale(kScaleFactor);
  scale.tare(15);

  Serial.println(F("Reading every 1 s. Set kScaleFactor = reading_with_known_mass / mass_g for grams."));
}

void loop() {
  float value = scale.get_units(10);
  Serial.print(F("Weight: "));
  Serial.print(value, 2);
  if (kScaleFactor == 1.0f) {
    Serial.println(F(" (uncalibrated units)"));
  } else {
    Serial.println(F(" g"));
  }
  delay(1000);
}
