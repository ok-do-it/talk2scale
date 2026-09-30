# Data Model: Native Android App

The app owns no server-side data. It holds in-memory state, two persisted preferences, and client copies of backend records. Backend shapes are listed in [contracts/backend-api.md](contracts/backend-api.md).

## Persisted preferences (DataStore)

| Key | Type | Default | Source in React Native |
|-----|------|---------|------------------------|
| `scale_mac` | String? | none | `storage.ts` `KEY_MAC` |
| `user_id` | Int | `1` | `storage.ts` `KEY_USER_ID`, `DEFAULT_USER_ID` |

- `scale_mac` is written after a successful connect and cleared by Forget All Devices.
- `user_id` is written when the user confirms a numeric ID. An empty entry leaves it unchanged.

## Scale state (application-scoped)

**ConnectionState**: `Disconnected` → `Connecting` → `Connected`; any failure or link loss → `Disconnected`.

**WeightReading**

| Field | Type | Rule |
|-------|------|------|
| `grams` | Int | Signed; from BLE or mock |
| `stable` | Boolean | True when the last 3 values are equal (window 3); mock readings are always stable |

**ScaleState**

| Field | Type | Rule |
|-------|------|------|
| `connection` | ConnectionState | Tracks real BLE only |
| `reading` | WeightReading? | Null until the first value |
| `lastGrams` | Int | Last published value |
| `mockEnabled` | Boolean | Starts true. Turns false on real connect or when a real connection is requested. Turns true on disconnect or failed reconnect. |
| `realConnectionRequested` | Boolean | True from connect request until disconnect or cancel |

Rules from `scaleStore.ts`:

- BLE readings are published only while `Connected`. Mock readings are published only while not connected and `mockEnabled`.
- Tare goes to BLE when connected, otherwise to the mock (local zero).
- Calibrate is sent only when connected. Otherwise the UI says the scale is not connected.
- On start with a stored `scale_mac`, reconnect with `autoConnect`; on failure, fall back to mock mode.

**ScannedDevice**: `address` (String), `name` (String?). Discovered when the advertised service UUID matches or the name is `TalkToScale`. De-duplicated by address.

## Food entry (Scale page and Create Recipe)

**FoodEntryState**

| Field | Type | Rule |
|-------|------|------|
| `query` | String | Typed or transcribed text |
| `results` | List<FoodHit> | Up to 6 hits from `/search-food`, fetched 300 ms after typing stops |
| `listening` | Boolean | True while the mic button is held |
| `spokenGrams` | Int? | Grams from the transcription, overrides the scale weight when set |
| `autoSelect` | FoodHit? | After a voice search, the first hit is picked after a 3 s countdown unless the user changes the query |

**ResolvedFood**: `rawName`, `elementId`, `amountGrams`. `amountGrams` is `spokenGrams` if set, else `lastGrams`. Must be greater than 0 when creating a new log. After a new log is created, the app sends Tare.

## Dashboard

**FoodLogRow**: `id`, `name` (from `raw_name`), `loggedAt`, `kcal` (rounded, 0 if missing).

- Today is local midnight to 23:59:59.999.
- Rows are sorted newest first. A new cluster header (showing the first row's time) starts when the gap to the previous row is more than 30 minutes.
- Tapping a row enters edit mode: the Scale page opens with the row's name as the query. Picking a food updates `element_id` and `raw_name` only.
- Swiping a row right asks to delete it, then refreshes the dashboard.

**SummaryRow**: nutrient name, today's amount, target amount (if any). Built from `/users/:id/food-logs/nutrients`, `/users/:id/daily-targets`, and `/elements?type=nutrient` (only fetched when targets list nutrients). On load failure, the last good totals stay on screen with an error line.

## Recipe draft (local only)

| Field | Type | Rule |
|-------|------|------|
| `name` | String | Required, trimmed |
| `servingGrams` | String | Optional; if set, must parse to a number > 0 |
| `ingredients` | List<`elementId`, `name`, `grams`> | At least one |

Saved in one `POST /recipes` with `children = [{ element_id, grams }]`. Leaving with ingredients asks to discard.
