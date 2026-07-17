# Talk to Scale

A smart kitchen scale that combines hardware weight sensing with AI-powered voice logging to track food nutrition, net calories, and health metrics in one workflow.
The whole idea of the project - minimize nutrition tracking efforts as much as possible. Every minor improvement can be crutial for keeping diet.


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
| **Mobile app** (React Native, Expo; see `mobile/`) | BLE to the scale, cloud STT through the backend, logging UI, dashboard, offline queue |
| **Firmware** (ESP32, PlatformIO; see `esp32/`) | HX711 reads, stability detection, BLE GATT service, tare, optional WiFi OTA |

Each module will live in its own top-level directory once bootstrapped (e.g. `backend/`, `mobile/`, `esp32/`).

## DB Explorer

A lightweight browser UI for exploring the Element table.
Start the backend and open `http://localhost:8888/explore.html`.

## Run backend + mobile app

Use this flow to test audio food search while adding meal log items in the scale app.

1. Create local env files once:

```bash
cp .env.example .env
cp mobile/.env.example mobile/.env
```

2. Start Postgres:

```bash
cd db
docker compose up -d
```

3. Seed the backend data and embeddings if needed:

```bash
cd backend
npm run clean-reseed
npm run embed-food-names
```

4. Start the backend:

```bash
cd backend
npm run dev
```

Wait for the backend to report that the database, embedding model, voice model, and server are ready.

5. Set up and run the mobile app:

- [Mobile app setup](docs/mobile-app/setup.md)
- [Run on Android emulator](docs/mobile-app/run-emulator.md)
- [Run on WiFi Android phone](docs/mobile-app/run-phone.md)

6. In the app, open the scale screen. Without real BLE hardware, use mock scale mode: tap the large weight display to add a mock weight.

7. Hold **Hold to speak**, say a food name, then release. The app sends the recording to `/voice/transcribe`, searches for the matched food, and adds it to the current meal log with the current weight.

8. Repeat for more items, then tap **Submit**. Meal submission is currently stored in mobile local state; audio search uses the backend.

## User flow (end-to-end)

```
Scale (stable weight) ──BLE──► Mobile app ──► Backend ──► LLM / USDA
                                │     │            │
                                │     └── STT ─────┘ (on-device or Whisper)
                                └──────────────────────► Garmin (burned calories) → net intake
```

## Speech-to-text (mobile)

The React Native app records a short audio clip and sends it to the backend voice endpoint. The backend transcribes and resolves the spoken food name before the app adds it to the current meal flow.

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
| **food_name** | Searchable/display aliases for an Element (`id`, `elementId`, `name`, `locale`, `is_default`, `rank`). USDA long descriptions plus curated short names; see [`docs/db/import-usda.md`](docs/db/import-usda.md). |
| **Unit** | Serving definitions like "slice" or "cup" (`id`, `elementId`, `name`, `grams`). |
| **Meal** | Timestamped collection of logs (`id`, `userId`, `name`, `loggedAt`). |
| **Log** | A single weighed portion: `id`, `mealId` (FK → Meal), `elementId` (FK → Element), `amount`, `measureId` (FK → Measure), `rawName`. **No macro columns** — resolve nutrition by joining `Element` and `Link` using recursive CTEs. |
| **NutrientGroup** | (Concept, not an RDBMS table.) Admin-curated presentation buckets for nutrients. Membership is defined in [`backend/data/nutrient_group.json`](backend/data/nutrient_group.json) (USDA `nutrient.id` lists); the API resolves those to `element.id` at runtime after nutrients exist in the DB. Exposed as `GET /nutrient-groups` and used to build grouped responses for `GET /element/:id/nutrients`. Group `id` values are stable synthetic integers (load order), not persisted — not part of composition math. |

Net intake for a day is derived as `consumed_calories − burned_calories` (or compute consumed from logs if you prefer a single source of truth later). See [`docs/db/schema.md`](docs/db/schema.md) for full details.

---

For hardware diagrams and wiring notes, see [`docs/hardware/README.md`](docs/hardware/README.md).
