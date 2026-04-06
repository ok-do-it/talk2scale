# Talk2Scale — Database Schema

## Overview

Five core entities: `Nutrient`, `FoodName`, `FoodItem`, `FoodNutrient` (junction), `Meal`, `LogEntry`.

---

## Entities

### `Nutrient`

A type of nutritional value (calories, protein, fat, etc.).

| Field  | Type        | Notes                              |
|--------|-------------|------------------------------------|
| `id`   | BIGINT (PK) |                                    |
| `name` | String      | e.g. `"Protein"`, `"Calories"`, `"Total Fat"` |
| `unit` | String/Enum | e.g. `"kcal"`, `"g"`, `"mg"`      |

Seeded from a standard set (USDA macro/micro nutrients).

---

### `FoodName`

A searchable name or alias for a food item. Separating names from `FoodItem` allows multiple names per food (synonyms, locale variants, brand names).

| Field        | Type               | Notes                                      |
|--------------|--------------------|--------------------------------------------|
| `id`         | BIGINT (PK)        |                                            |
| `foodItemId` | BIGINT (FK → FoodItem) |                                        |
| `name`       | String             | e.g. `"Bananas, Raw"` or `"Banana"`        |
| `locale`     | String?            | Optional: `"en"`, `"de"`                   |
| `isPrimary`  | Boolean            | True for canonical display name            |

Existing `foods.json` strings map here directly — each becomes a `FoodName` with `isPrimary=true`.

---

### `FoodItem`

The canonical food entity, holding nutritional composition per 100g via a junction table. Compound structure TBD

| Field       | Type             | Notes              |
|-------------|------------------|--------------------|
| `id`        | BIGINT (PK)      |                    |
| `type`      | Enum (atomic, compound/recipie)| descriminator|
| `names`     | FoodName[]       | One-to-many        |
| `nutrients` | FoodNutrient[]   | Per-100g values    |

---

### `FoodItemNutrient` (junction: FoodItem ↔ Nutrient)

| Field           | Type      | Notes                          |
|-----------------|-----------|--------------------------------|
| `foodItemId`    | BIGINT (FK) | References FoodItem          |
| `nutrientId`    | BIGINT (FK) | References Nutrient          |
| `amountPer100g` | Float     | Nutrient amount per 100g of food |

Composite primary key: `(foodItemId, nutrientId)`.

---

### `Meal`

A timestamped collection of log entries — represents one eating occasion.

| Field        | Type         | Notes                                          |
|--------------|--------------|------------------------------------------------|
| `id`         | BIGINT (PK)  |                                                |
| `userId`     | String       | User identifier (stored locally on device)     |
| `name`       | String?      | Optional label, e.g. `"Lunch"`                 |
| `loggedAt`   | DateTime     | When the meal was recorded                     |
| `logEntries` | LogEntry[]   | One-to-many                                    |

---

### `LogEntry`

A single food+weight measurement within a meal. Nutrition is computed dynamically from `FoodItem × weightGrams / 100`.

| Field         | Type               | Notes                                              |
|---------------|--------------------|----------------------------------------------------|
| `id`          | BIGINT (PK)        |                                                    |
| `mealId`      | BIGINT (FK → Meal) |                                                    |
| `foodItemId`  | BIGINT? (FK → FoodItem) | Nullable until food is resolved/confirmed     |
| `foodNameRaw` | String             | Original voice/text input from user                |
| `weightGrams` | Int                | Weight from BLE scale                              |
| `loggedAt`    | DateTime           | Timestamp of this log entry                        |

**Computed (not stored):**
- `calories` = `FoodNutrient(calories).amountPer100g × weightGrams / 100`
- Any other nutrient totals derived the same way

---

## Key Design Decisions

1. **FoodName is separate from FoodItem** — allows `"Banana"`, `"Bananas, Raw"`, `"Плод банана"` to all resolve to the same nutritional item.
2. **FoodItemId on LogEntry is nullable** — voice input may not immediately resolve; allows optimistic logging and later confirmation.
3. **Nutrition is not stored on LogEntry** — always computed from FoodItem data to keep truth in one place. A snapshot column (`nutrientsSnapshot: Json?`) can be added later for historical accuracy if food data changes.
4. **Meal groups LogEntries** — enables day-view aggregation (sum calories across meals) for day summary/chart views.
5. **userId is a plain String** — matches current Android plan (just a text input, no auth system yet).
