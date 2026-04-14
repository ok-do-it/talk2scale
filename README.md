# Talk to Scale

A smart kitchen scale that combines hardware weight sensing with AI-powered voice logging to track food nutrition, net calories, and health metrics in one workflow.

## Concept

1. Place food on the scale  
2. Speak the food name into the phone  
3. The system combines stable weight + voice to look up nutrition  
4. Logs the entry with macro and micronutrient detail  
5. Optionally syncs burned calories (e.g. Garmin) for net daily balance  

## Repository modules

| Module | Role |
|--------|------|
| **Backend** (TypeScript) | API keys and proxy for Whisper (if used), LLM (food parsing), USDA, Garmin OAuth; persistence; optional job queue for offline sync |
| **Mobile app** (Native Android, Java) | BLE to the scale, on-device or cloud STT, logging UI, dashboard, offline queue |
| **Firmware** (ESP32, PlatformIO; see `esp32/`) | HX711 reads, stability detection, BLE GATT service, tare, optional WiFi OTA |

Each module will live in its own top-level directory once bootstrapped (e.g. `backend/`, `mobile/`, `esp32/`).

## User flow (end-to-end)

```
Scale (stable weight) ──BLE──► Mobile app ──► Backend ──► LLM / USDA
                                │     │            │
                                │     └── STT ─────┘ (on-device or Whisper)
                                └──────────────────────► Garmin (burned calories) → net intake
```

## Speech-to-text (mobile)

The app can use **Android built-in recognition** (`android.speech.SpeechRecognizer`). Parsed text still goes to an LLM and USDA the same way.

| | Built-in (Android) | Whisper API |
|--|-------------------|-------------|
| **Cost** | No per-minute API cost | Pay per use |
| **Privacy** | Audio handled by OS / Google stack on device | Audio sent to OpenAI |
| **Quality** | Strong for general dictation; rare food terms may be wrong | Often better for noisy audio and uncommon words |
| **Offline** | Sometimes (offline language packs); not guaranteed on all devices | Requires network to the API |

## Hardware (summary)

- Repurposed kitchen scale enclosure, platform, and load cells  
- ESP32 DevKit, HX711, tare button on GPIO  
- Detail and schematics: [`docs/hardware/`](docs/hardware/)

## BLE protocol (sketch)

One **notify** characteristic the app subscribes to once. Each notification carries:

- **Weight** — e.g. grams (fixed-point or integer; define in firmware)  
- **Stability** — 1 bit: unstable vs stable reading  
- **Calibration** — 1 bit: normal (calibrated) vs uncalibrated  

**Write** side (one characteristic with a small command envelope, or separate writes—pick one in firmware):

- **TARE** — zero the scale (same idea as the physical tare button)  
- **CALIBRATE** — reference mass in grams for the known weight on the platform (firmware derives scale factor from current raw reading and this value)  

Exact UUIDs, byte order, field widths, command opcodes, and error handling belong in `esp32/` firmware and app docs as they are implemented.

## Data model (RDBMS sketch)

| Table | Purpose |
|-------|--------|
| **Users** | `id`, `name`, `email` (minimal for now). |
| **Element** | Canonical component: nutrients, foods, recipes (`id`, `type`, `name`, `owner`). |
| **Link** | Recursive composition junction (`parentId`, `childId`, `ratio`). Creates a directed acyclic graph (DAG) of components. |
| **Alias** | Searchable/display aliases for an Element (`id`, `elementId`, `name`, `locale`). |
| **Unit** | Serving definitions like "slice" or "cup" (`id`, `elementId`, `name`, `grams`). |
| **Meal** | Timestamped collection of logs (`id`, `userId`, `name`, `loggedAt`). |
| **Log** | A single weighed portion: `id`, `mealId` (FK → Meal), `elementId` (FK → Element), `amount`, `unitId` (FK → Unit), `rawName`. **No macro columns** — resolve nutrition by joining `Element` and `Link` using recursive CTEs. |

Net intake for a day is derived as `consumed_calories − burned_calories` (or compute consumed from logs if you prefer a single source of truth later). See [`docs/db/schema.md`](docs/db/schema.md) for full details.

---

For hardware diagrams and wiring notes, see [`docs/hardware/README.md`](docs/hardware/README.md).
